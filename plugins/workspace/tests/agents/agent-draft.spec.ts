import { describe, expect, it } from 'vitest'
import { draftToAgent, EMPTY_DRAFT, previewCommand, slugifyAgentId } from '../../src/client/agents/agent-draft.ts'

describe('slugifyAgentId', () => {
  it('makes a valid id from a name', () => {
    expect(slugifyAgentId('My Agent!')).toBe('my-agent')
    expect(slugifyAgentId('  Qwen  Code 2 ')).toBe('qwen-code-2')
    expect(slugifyAgentId('9lives')).toBe('a-9lives')
    expect(slugifyAgentId('!!!')).toBe('')
  })
})

describe('draftToAgent', () => {
  const draft = { ...EMPTY_DRAFT, name: 'My Agent', command: 'my-agent', args: '--model\nfast model\n' }

  it('builds a definition, taking the badge letter from the name and one argument per line', () => {
    const result = draftToAgent(draft)
    expect(result.ok && result.agent).toMatchObject({ id: 'my-agent', label: 'My Agent', command: 'my-agent', args: ['--model', 'fast model'], badge: { letter: 'M' } })
  })

  it('explains what to fix instead of building anything unsafe', () => {
    expect(draftToAgent({ ...draft, command: 'my-agent && rm -rf ~' })).toMatchObject({ ok: false })
    expect(draftToAgent({ ...draft, name: 'claude' })).toMatchObject({ ok: false, message: expect.stringContaining('built-in') })
    expect(draftToAgent({ ...draft, name: '' })).toMatchObject({ ok: false })
    expect(draftToAgent({ ...draft, command: '' })).toMatchObject({ ok: false, message: expect.stringContaining('command') })
  })

  it('shows the exact command line, quoting an argument that has spaces', () => {
    const result = draftToAgent(draft)
    expect(result.ok && previewCommand(result.agent)).toBe('my-agent --model "fast model"')
  })
})
