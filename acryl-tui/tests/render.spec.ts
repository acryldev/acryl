import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallView, ToolDefinition, ToolResultView } from '@deepseek-ai/dsh-tools'
import {
  formatEvent,
  formatPendingToolCalls,
  formatShellRun,
  formatShellRunLive,
  formatStreamingText,
  formatToolCardDetail,
  formatToolCardSummary,
  truncate,
  type RenderOptions,
} from '../src/render.js'

/** Build a minimal event fixture; formatEvent only ever reads `.type`/`.data`. */
function event(type: string, data: unknown): SessionEvent {
  return { type, seq: 1, time: 0, data } as unknown as SessionEvent
}

/** A `ToolDefinition` with only the presentation methods a test needs; other fields are never read. */
function fakeTool(overrides: Partial<Pick<ToolDefinition, 'presentCall' | 'presentResult'>>): ToolDefinition {
  return overrides as unknown as ToolDefinition
}

/** A `getTool` resolver serving one named tool. */
function toolResolver(name: string, tool: ToolDefinition): RenderOptions['getTool'] {
  return toolName => (toolName === name ? tool : undefined)
}

/** A `getToolCall` resolver serving one `callId -> {name, arguments}` pair. */
function callResolver(callId: string, call: { name: string; arguments: string }): RenderOptions['getToolCall'] {
  return id => (id === callId ? call : undefined)
}

/** A `tool/result` event fixture whose `message.source.callId` correlates back to its `tool/call`. */
function resultEvent(callId: string, content: unknown[], isError: boolean): SessionEvent {
  return event('tool/result', {
    message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', content, isError }] },
  })
}

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('hello', 100)).toBe('hello')
  })

  it('collapses embedded newlines to spaces', () => {
    expect(truncate('a\nb\nc', 100)).toBe('a b c')
  })

  it('truncates with an ellipsis over the limit', () => {
    const result = truncate('abcdefghij', 5)
    expect(result).toHaveLength(5)
    expect(result.endsWith('…')).toBe(true)
    expect(result).toBe('abcd…')
  })
})

describe('formatEvent — user/message', () => {
  it('renders a direct human prompt in full', () => {
    const line = formatEvent(
      event('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'hello there' }] }),
      { replay: false },
    )
    expect(line).toContain('you ›')
    expect(line).toContain('hello there')
  })

  it('renders nothing for an empty human prompt', () => {
    const line = formatEvent(
      event('user/message', { source: { kind: 'user' }, content: [] }),
      { replay: false },
    )
    expect(line).toBeUndefined()
  })

  it('collapses a plugin-injected notice to a summary line', () => {
    const line = formatEvent(
      event('user/message', {
        source: { kind: 'plugin', plugin: 'skill-loader', form: 'notice', summary: 'loaded 3 skills' },
        content: [{ type: 'text', text: 'irrelevant, never shown' }],
      }),
      { replay: false },
    )
    expect(line).toContain('⊕ context ›')
    expect(line).toContain('skill-loader')
    expect(line).toContain('loaded 3 skills')
    expect(line).not.toContain('irrelevant')
  })

  it('omits the summary for a plugin source with no notice form', () => {
    const line = formatEvent(
      event('user/message', {
        source: { kind: 'plugin', plugin: 'agents-md', form: 'context' },
        content: [{ type: 'text', text: 'irrelevant' }],
      }),
      { replay: false },
    )
    expect(line).toContain('agents-md')
    expect(line).not.toContain('·')
  })

  it('falls back to a generic label for an unrecognized source kind', () => {
    const line = formatEvent(
      event('user/message', { source: { kind: 'tool' }, content: [] }),
      { replay: false },
    )
    expect(line).toContain('⊕ context ›')
    expect(line).toContain('tool')
  })

  it('collapses a goal continuation round to a label naming its round', () => {
    const line = formatEvent(
      event('user/message', {
        source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 3 },
        content: [{ type: 'text', text: '<goal_round>…' }],
      }),
      { replay: false },
    )
    expect(line).toContain('⊕ goal ›')
    expect(line).toContain('round 3')
    expect(line).not.toContain('<goal_round>')
  })
})

describe('formatEvent — assistant/message', () => {
  it('joins text blocks wrapped in leading/trailing newlines', () => {
    const line = formatEvent(
      event('assistant/message', { message: { content: [{ type: 'text', text: 'part one' }, { type: 'text', text: ' part two' }] } }),
      { replay: false },
    )
    expect(line).toBe('\npart one part two\n')
  })

  it('renders nothing for empty content', () => {
    const line = formatEvent(
      event('assistant/message', { message: { content: [] } }),
      { replay: false },
    )
    expect(line).toBeUndefined()
  })

  it('collapses reasoning to a one-line summary ahead of the visible text, not the full body', () => {
    const line = formatEvent(
      event('assistant/message', {
        message: { content: [{ type: 'reasoning', text: 'weighing options' }, { type: 'text', text: 'the answer' }] },
      }),
      { replay: false },
    )
    expect(line).toContain('✦ think ·')
    expect(line).toContain('weighing options')
    expect(line).toContain('the answer')
    expect(line!.indexOf('weighing options')).toBeLessThan(line!.indexOf('the answer'))
  })

  it('truncates a long reasoning block to its summary preview length', () => {
    const long = 'x'.repeat(200)
    const line = formatEvent(
      event('assistant/message', { message: { content: [{ type: 'reasoning', text: long }, { type: 'text', text: 'ok' }] } }),
      { replay: false },
    )
    expect(line).toContain('✦ think ·')
    expect(line).not.toContain(long)
    expect(line).toContain('…')
  })

  it('renders reasoning-only content with no visible text', () => {
    const line = formatEvent(
      event('assistant/message', { message: { content: [{ type: 'reasoning', text: 'still thinking' }] } }),
      { replay: false },
    )
    expect(line).toContain('✦ think ·')
    expect(line).toContain('still thinking')
  })
})

describe('formatStreamingText', () => {
  it('mirrors assistant/message framing for non-empty text', () => {
    expect(formatStreamingText('Hello')).toBe('\nHello\n')
  })

  it('renders nothing for empty text and empty reasoning', () => {
    expect(formatStreamingText('')).toBeUndefined()
    expect(formatStreamingText('', '')).toBeUndefined()
  })

  it('shows the spinner frame as the icon on an animated thinking line, not the raw reasoning body, while text has not started yet', () => {
    const result = formatStreamingText('', 'thinking it through', '⠋')
    expect(result).toContain('⠋ thinking')
    expect(result).not.toContain('thinking it through')
  })

  it('switches to the plain text once it starts streaming, dropping the reasoning line', () => {
    const result = formatStreamingText('answer', 'thinking it through', '⠋')
    expect(result).toBe('\nanswer\n')
  })

  it('defaults the spinner character when none is passed', () => {
    const result = formatStreamingText('', 'thinking it through')
    expect(result).toContain('✦ thinking')
  })
})

describe('formatEvent — tool/call', () => {
  it('never renders its own transcript line — a pending call lives in the live region, and settles into the transcript via its tool/result', () => {
    const view: ToolCallView = { card: 'generic', title: 'Read src/foo.ts', kind: 'read' }
    const tool = fakeTool({ presentCall: () => view })
    const line = formatEvent(
      event('tool/call', { name: 'read_file', arguments: '{"path":"src/foo.ts"}' }),
      { replay: false, getTool: toolResolver('read_file', tool) },
    )
    expect(line).toBeUndefined()
  })

  it('is undefined with no getTool supplied too', () => {
    const line = formatEvent(
      event('tool/call', { name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }),
      { replay: false },
    )
    expect(line).toBeUndefined()
  })
})

describe('formatPendingToolCalls', () => {
  it('renders nothing for an empty list', () => {
    expect(formatPendingToolCalls([], '⠋', undefined)).toBe('')
  })

  it('includes the tool name and truncated arguments when no getTool is supplied', () => {
    const text = formatPendingToolCalls([{ name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }], '⠋', undefined)
    expect(text).toContain('read_file')
    expect(text).toContain('/tmp/foo.txt')
    expect(text).toContain('⠋')
  })

  it('falls back to the flat line when the tool has no presentCall', () => {
    const text = formatPendingToolCalls(
      [{ name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }],
      '⠋',
      toolResolver('read_file', fakeTool({})),
    )
    expect(text).toContain('read_file')
    expect(text).toContain('/tmp/foo.txt')
  })

  it('falls back to the flat line when presentCall returns undefined', () => {
    const tool = fakeTool({ presentCall: () => undefined })
    const text = formatPendingToolCalls([{ name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }], '⠋', toolResolver('read_file', tool))
    expect(text).toContain('read_file')
    expect(text).toContain('/tmp/foo.txt')
  })

  it('falls back to the flat line when presentCall throws', () => {
    const tool = fakeTool({
      presentCall: () => {
        throw new Error('boom')
      },
    })
    const text = formatPendingToolCalls([{ name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }], '⠋', toolResolver('read_file', tool))
    expect(text).toContain('read_file')
    expect(text).toContain('/tmp/foo.txt')
  })

  it('falls back to the flat line when the arguments are not valid JSON', () => {
    const tool = fakeTool({ presentCall: () => ({ card: 'generic', title: 'should not be reached' }) })
    const text = formatPendingToolCalls([{ name: 'read_file', arguments: 'not json' }], '⠋', toolResolver('read_file', tool))
    expect(text).toContain('read_file')
    expect(text).not.toContain('should not be reached')
  })

  it('uses the presented title in place of the raw name/arguments', () => {
    const view: ToolCallView = { card: 'generic', title: 'Read src/foo.ts', kind: 'read' }
    const tool = fakeTool({ presentCall: () => view })
    const text = formatPendingToolCalls([{ name: 'read_file', arguments: '{"path":"src/foo.ts"}' }], '⠋', toolResolver('read_file', tool))
    expect(text).toContain('Read src/foo.ts')
  })

  it('renders one line per concurrent pending call, in order', () => {
    const readView: ToolCallView = { card: 'generic', title: 'Read a.ts', kind: 'read' }
    const bashView: ToolCallView = { card: 'terminal', title: 'ls -la' }
    const getTool: RenderOptions['getTool'] = name =>
      name === 'read_file' ? fakeTool({ presentCall: () => readView }) : fakeTool({ presentCall: () => bashView })
    const text = formatPendingToolCalls(
      [
        { name: 'read_file', arguments: '{}' },
        { name: 'bash', arguments: '{}' },
      ],
      '⠋',
      getTool,
    )
    const lines = text.split('\n').filter(l => l !== '')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Read a.ts')
    expect(lines[1]).toContain('ls -la')
  })
})

describe('formatEvent — tool/result', () => {
  it('shows an internal harness-level error, independent of the block', () => {
    const line = formatEvent(
      event('tool/result', {
        error: { code: 'E_TIMEOUT', name: 'ToolTimeoutError' },
        message: { content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ignored' }], isError: false }] },
      }),
      { replay: false },
    )
    expect(line).toContain('E_TIMEOUT')
    expect(line).toContain('ToolTimeoutError')
    expect(line).not.toContain('ignored')
  })

  it('shows the failure icon when the block reports isError', () => {
    const line = formatEvent(
      event('tool/result', {
        message: {
          source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: 'permission denied' }], isError: true }],
        },
      }),
      { replay: false },
    )
    expect(line).toContain('✖')
    expect(line).toContain('permission denied')
  })

  it('shows the success icon when the block does not report isError', () => {
    const line = formatEvent(
      event('tool/result', {
        message: {
          source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }], isError: false }],
        },
      }),
      { replay: false },
    )
    expect(line).toContain('✓')
    expect(line).toContain('ok')
  })

  it('renders a bare icon with no trailing content for an empty result', () => {
    const line = formatEvent(
      event('tool/result', {
        message: {
          source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', content: [], isError: false }],
        },
      }),
      { replay: false },
    )
    expect(line?.trim()).toBe(line)
    expect(line).toContain('✓')
  })

  it('bypasses presentation for an internal error even with getTool/getToolCall supplied', () => {
    const tool = fakeTool({ presentResult: () => ({ card: 'generic', title: 'should not be reached' }) })
    const line = formatEvent(
      event('tool/result', {
        error: { code: 'E_TIMEOUT', name: 'ToolTimeoutError' },
        message: {
          source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', content: [], isError: false }],
        },
      }),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('E_TIMEOUT')
    expect(line).not.toContain('should not be reached')
  })

  it('falls back to the flat line when getToolCall has no matching call', () => {
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'ok' }], false),
      { replay: false, getToolCall: callResolver('call-2', { name: 'read_file', arguments: '{}' }) },
    )
    expect(line).toContain('✓')
    expect(line).toContain('ok')
  })

  it('falls back to the flat line when the tool has no presentResult', () => {
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'ok' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', fakeTool({})),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('✓')
    expect(line).toContain('ok')
  })

  it('falls back to the flat line when presentResult returns undefined', () => {
    const tool = fakeTool({ presentResult: () => undefined })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'ok' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('✓')
    expect(line).toContain('ok')
  })

  it('falls back to the flat line when presentResult throws', () => {
    const tool = fakeTool({
      presentResult: () => {
        throw new Error('boom')
      },
    })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'ok' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('✓')
    expect(line).toContain('ok')
  })

  it('falls back to the flat line when the correlated call has malformed arguments', () => {
    const tool = fakeTool({ presentResult: () => ({ card: 'generic', title: 'should not be reached' }) })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'ok' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: 'not json' }),
      },
    )
    expect(line).toContain('✓')
    expect(line).not.toContain('should not be reached')
  })

  it('collapses a generic card to its presented title, dropping the reformatted body', () => {
    const view: ToolResultView = { card: 'generic', title: 'Read src/foo.ts', content: [{ type: 'text', text: '1: hello' }] }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('Read src/foo.ts')
    expect(line).not.toContain('1: hello')
    expect(line).not.toContain('raw')
    expect(line?.includes('\n')).toBe(false)
  })

  it('collapses a terminal card to a single line, dropping output/exit-code detail', () => {
    const view: ToolResultView = { card: 'terminal', output: 'total 0\ndrwx------', exitCode: 0 }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('bash', tool),
        getToolCall: callResolver('call-1', { name: 'bash', arguments: '{"command":"ls -la"}' }),
      },
    )
    expect(line).toContain('bash')
    expect(line).not.toContain('total 0')
    expect(line).not.toContain('drwx------')
    expect(line).not.toContain('[exit 0]')
    expect(line?.includes('\n')).toBe(false)
  })

  it('falls back to the call\'s presented command, labeled with the tool name, when the terminal result omits its own title', () => {
    const callView: ToolCallView = { card: 'terminal', title: 'ls -la' }
    const resultView: ToolResultView = { card: 'terminal', output: 'total 0\ndrwx------', exitCode: 0 }
    const tool = fakeTool({ presentCall: () => callView, presentResult: () => resultView })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('bash', tool),
        getToolCall: callResolver('call-1', { name: 'bash', arguments: '{"command":"ls -la"}' }),
      },
    )
    expect(line).toContain('Bash: ls -la')
  })

  it('shows the command, not the description, in that fallback label — the command is the summary\'s salient detail', () => {
    const callView: ToolCallView = { card: 'terminal', title: 'ls -la', description: 'List files in the repo root' }
    const resultView: ToolResultView = { card: 'terminal', output: 'total 0\ndrwx------', exitCode: 0 }
    const tool = fakeTool({ presentCall: () => callView, presentResult: () => resultView })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('bash', tool),
        getToolCall: callResolver('call-1', { name: 'bash', arguments: '{"command":"ls -la"}' }),
      },
    )
    expect(line).toContain('Bash: ls -la')
    expect(line).not.toContain('List files in the repo root')
  })

  it('collapses to a single line no matter how large the underlying card body is', () => {
    const output = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join('\n')
    const tool = fakeTool({ presentResult: () => ({ card: 'terminal', output }) })
    const line = formatEvent(resultEvent('call-1', [{ type: 'text', text: 'raw' }], false), {
      replay: false,
      getTool: toolResolver('bash', tool),
      getToolCall: callResolver('call-1', { name: 'bash', arguments: '{}' }),
    })
    expect(line).not.toContain('line 24')
    expect(line?.includes('\n')).toBe(false)
  })

  it('collapses a diff card to its title, dropping the +/- lines', () => {
    const view: ToolResultView = {
      card: 'diff',
      title: 'Write foo.txt',
      diffs: [{ path: 'foo.txt', oldText: 'old', newText: 'new' }],
    }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('write', tool),
        getToolCall: callResolver('call-1', { name: 'write', arguments: '{}' }),
      },
    )
    expect(line).toContain('Write foo.txt')
    expect(line).not.toContain('- old')
    expect(line).not.toContain('+ new')
  })

  it('collapses a search card to its title, dropping the per-file matches', () => {
    const view: ToolResultView = {
      card: 'search',
      shape: 'matches',
      files: [{ path: 'src/a.ts', matches: [{ lineNumber: 3, line: 'const x = 1' }] }],
      truncated: true,
      total: 50,
    }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('grep', tool),
        getToolCall: callResolver('call-1', { name: 'grep', arguments: '{}' }),
      },
    )
    expect(line).toContain('grep')
    expect(line).not.toContain('const x = 1')
    expect(line).not.toContain('1 of 50')
  })

  it('collapses a read card to a single line, falling back to the tool name when the view sets no title', () => {
    const view: ToolResultView = {
      card: 'read',
      path: 'src/a.ts',
      offset: 1,
      lines: [{ number: 1, text: 'const x = 1' }],
      totalLines: 200,
    }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('read_file')
    expect(line).not.toContain('const x = 1')
    expect(line?.includes('\n')).toBe(false)
  })

  it('falls back to the call\'s presented title (not the tool name) when the read result omits its own title', () => {
    const callView: ToolCallView = { card: 'generic', title: 'Read src/a.ts' }
    const resultView: ToolResultView = {
      card: 'read',
      path: 'src/a.ts',
      offset: 1,
      lines: [{ number: 1, text: 'const x = 1' }],
      totalLines: 200,
    }
    const tool = fakeTool({ presentCall: () => callView, presentResult: () => resultView })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('read_file', tool),
        getToolCall: callResolver('call-1', { name: 'read_file', arguments: '{}' }),
      },
    )
    expect(line).toContain('Read src/a.ts')
    expect(line).not.toContain('read_file')
  })

  it('collapses a web search card to its title, dropping the citation list', () => {
    const view: ToolResultView = {
      card: 'web',
      kind: 'search',
      sources: [{ url: 'https://example.com', title: 'Example' }],
      truncated: false,
    }
    const tool = fakeTool({ presentResult: () => view })
    const line = formatEvent(
      resultEvent('call-1', [{ type: 'text', text: 'raw' }], false),
      {
        replay: false,
        getTool: toolResolver('web_search', tool),
        getToolCall: callResolver('call-1', { name: 'web_search', arguments: '{}' }),
      },
    )
    expect(line).toContain('web_search')
    expect(line).not.toContain('Example')
    expect(line).not.toContain('https://example.com')
  })
})

describe('formatToolCardDetail / formatToolCardSummary', () => {
  it('formatToolCardDetail returns the full, uncapped card body for the Tool Cards overlay', () => {
    const output = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join('\n')
    const tool = fakeTool({ presentResult: () => ({ card: 'terminal', output }) })
    const options: RenderOptions = {
      replay: false,
      getTool: toolResolver('bash', tool),
      getToolCall: callResolver('call-1', { name: 'bash', arguments: '{}' }),
    }
    const lines = formatToolCardDetail(resultEvent('call-1', [{ type: 'text', text: 'raw' }], false), options)
    const joined = lines.join('\n')
    expect(joined).toContain('line 24')
    expect(joined).not.toContain('omitted')
  })

  it('formatToolCardSummary is always a single line, even for a multi-line card', () => {
    const view: ToolResultView = { card: 'terminal', output: 'total 0\ndrwx------', exitCode: 0 }
    const tool = fakeTool({ presentResult: () => view })
    const options: RenderOptions = {
      replay: false,
      getTool: toolResolver('bash', tool),
      getToolCall: callResolver('call-1', { name: 'bash', arguments: '{"command":"ls -la"}' }),
    }
    const summary = formatToolCardSummary(resultEvent('call-1', [{ type: 'text', text: 'raw' }], false), options)
    expect(summary.includes('\n')).toBe(false)
  })

  it('formatToolCardSummary falls back to the flat call line when there is no presenter', () => {
    const summary = formatToolCardSummary(event('tool/call', { name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' }), {
      replay: false,
    })
    expect(summary).toContain('read_file')
    expect(summary.includes('\n')).toBe(false)
  })
})

describe('formatEvent — turn/end', () => {
  it('renders an error reason', () => {
    const line = formatEvent(
      event('turn/end', { reason: { kind: 'error', error: { code: 'E_BOOM', message: 'it broke' } } }),
      { replay: false },
    )
    expect(line).toContain('E_BOOM')
    expect(line).toContain('it broke')
  })

  it('renders an aborted reason', () => {
    const line = formatEvent(event('turn/end', { reason: { kind: 'aborted' } }), { replay: false })
    expect(line).toContain('turn canceled')
  })

  it('renders nothing for other reason kinds', () => {
    const line = formatEvent(event('turn/end', { reason: { kind: 'completed' } }), { replay: false })
    expect(line).toBeUndefined()
  })
})

describe('formatEvent — compaction/summary', () => {
  it('reports the shadowed item and token counts', () => {
    const line = formatEvent(
      event('compaction/summary', { shadowedSeqs: [1, 2, 3], shadowedTokenCount: 456 }),
      { replay: false },
    )
    expect(line).toContain('3 items')
    expect(line).toContain('456 tokens')
  })
})

describe('formatEvent — compaction/end', () => {
  it('renders nothing on a clean end', () => {
    const line = formatEvent(event('compaction/end', {}), { replay: false })
    expect(line).toBeUndefined()
  })

  it('renders the error when compaction did not finish cleanly', () => {
    const line = formatEvent(event('compaction/end', { error: 'commit failed' }), { replay: false })
    expect(line).toContain('compaction')
    expect(line).toContain('commit failed')
  })
})

describe('formatEvent — goal/change', () => {
  /** A snapshot goal-change fixture carrying the minimal whole-value fields the renderer reads. */
  function snapshotChange(operation: string, objective = 'ship it'): SessionEvent {
    return event('goal/change', {
      kind: 'goal/change',
      version: 1,
      operation,
      goal: {
        id: 'goal-1',
        revision: 1,
        objective,
        phase: operation === 'block' ? 'blocked' : operation === 'complete' ? 'complete' : 'active',
        maxGoalRounds: 256,
      },
      roundsStarted: 0,
      createdAt: 1,
      updatedAt: 1,
    })
  }

  it('renders a clear tombstone', () => {
    const line = formatEvent(
      event('goal/change', { kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: 'goal-1', revision: 2 }, clearedAt: 2 }),
      { replay: false },
    )
    expect(line).toContain('goal cleared')
  })

  it('renders create and edit with the objective', () => {
    expect(formatEvent(snapshotChange('create'), { replay: false })).toContain('goal set: ship it')
    expect(formatEvent(snapshotChange('edit', 'ship the docs'), { replay: false })).toContain('goal updated: ship the docs')
  })

  it('renders pause, resume, and complete', () => {
    expect(formatEvent(snapshotChange('pause'), { replay: false })).toContain('goal paused')
    expect(formatEvent(snapshotChange('resume'), { replay: false })).toContain('goal resumed')
    expect(formatEvent(snapshotChange('complete'), { replay: false })).toContain('goal complete')
  })

  it('renders a block with its reason when present', () => {
    const blocked = event('goal/change', {
      kind: 'goal/change',
      version: 1,
      operation: 'block',
      goal: {
        id: 'goal-1',
        revision: 2,
        objective: 'ship it',
        phase: 'blocked',
        blockedReason: { code: 'round-limit', message: 'Goal reached its configured limit of 256 rounds.' },
        maxGoalRounds: 256,
      },
      roundsStarted: 256,
      createdAt: 1,
      updatedAt: 2,
    })
    const line = formatEvent(blocked, { replay: false })
    expect(line).toContain('goal blocked')
    expect(line).toContain('round-limit')
    expect(line).toContain('configured limit')
  })

  it('renders a block without a reason too', () => {
    const line = formatEvent(snapshotChange('block'), { replay: false })
    expect(line).toContain('goal blocked')
  })
})

describe('formatEvent — unhandled types', () => {
  it('falls through to undefined for a merge-extensible type this viewer does not present', () => {
    const line = formatEvent(event('todo/write', { todos: [] }), { replay: false })
    expect(line).toBeUndefined()
  })
})

describe('formatShellRun', () => {
  it('includes the command, output, and a clean exit code', () => {
    const line = formatShellRun('ls', 'a.txt\nb.txt\n', 0)
    expect(line).toContain('ls')
    expect(line).toContain('a.txt')
    expect(line).toContain('b.txt')
    expect(line).toContain('[exit 0]')
  })

  it('omits the output section for an empty-output run', () => {
    const line = formatShellRun('true', '', 0)
    expect(line.split('\n').filter(l => l !== '')).toHaveLength(2)
  })
})

describe('formatShellRunLive', () => {
  it('shows the command and accumulated output without an exit line', () => {
    const line = formatShellRunLive('ls', 'a.txt\n')
    expect(line).toContain('ls')
    expect(line).toContain('a.txt')
    expect(line).not.toContain('[exit')
  })
})
