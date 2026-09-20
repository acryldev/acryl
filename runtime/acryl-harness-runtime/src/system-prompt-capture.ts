/**
 * Capture and render the system prompt and tool list the model actually receives on the first turn of a new session. Development aid
 * behind `docs/system-prompt/current/*.md`: it drives one real session on a composed runtime with a dummy provider key, so the request
 * fails after the loop has already logged the assembled system message and the request header, which is all this reads. No model is
 * called successfully.
 */
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createAcrylSessionBridge } from './session-bridge.ts'

export interface CapturedSystemPrompt {
  /** The assembled system prompt text. */
  system: string
  /** The tool definitions sent after it. */
  tools: Array<{ name: string; description: string }>
  /** `provider/model` of the request. */
  model: string
}

export interface CaptureSystemPromptOptions {
  /** Bridge profile name for the composed runtime (`web`, `desktop`, or the CLI profile). */
  profile: string
  /** Select the `standard` agent preset first, as the browser client does for a new session. */
  selectStandardPreset: boolean
  /** Paths to replace with a placeholder, longest first. */
  scrub?: Array<[string, string]>
}

/**
 * Run one session on `ctx` and return what the model would receive.
 * @param ctx - a composed runtime root (web, desktop or CLI engine).
 * @param options - profile name, preset selection and path scrubbing.
 */
export async function captureSystemPrompt(ctx: Context, options: CaptureSystemPromptOptions): Promise<CapturedSystemPrompt> {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-prompt-ws-')))
  const bridge = createAcrylSessionBridge(ctx, { profile: options.profile, generationId: 'prompt-capture', attachment: 'owner', cwd: workspace })
  const captured: CapturedSystemPrompt = { system: '', tools: [], model: '' }
  try {
    const sessionId = await bridge.open()
    await bridge.selectModel({ sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    if (options.selectStandardPreset) {
      const presets = ctx.get('agentPresets' as never) as unknown as { select(agent: unknown, id: string): Promise<string> }
      const agent = (ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      await presets.select(agent, 'standard')
    }
    let ended: () => void = () => {}
    const done = new Promise<void>(resolve => { ended = resolve })
    await bridge.subscribeEvents(sessionId, event => {
      const { type, data } = event as { type: string; data?: Record<string, unknown> }
      if (type === 'system/message' && captured.system === '') {
        const content = (data?.message as { content?: Array<{ text?: string }> } | undefined)?.content ?? []
        captured.system = content.map(block => block.text ?? '').join('')
      }
      if (type === 'request/header' && captured.tools.length === 0) {
        const header = data?.header as { tools?: Array<{ name: string; description: string }>; config?: { provider?: string; model?: string } } | undefined
        captured.tools = header?.tools ?? []
        captured.model = `${header?.config?.provider ?? ''}/${header?.config?.model ?? ''}`
      }
      if (type === 'turn/end') ended()
    })
    await bridge.submitPrompt({ sessionId, text: 'hello' })
    await Promise.race([done, new Promise(resolve => setTimeout(resolve, 60_000))])
  } finally {
    await bridge.dispose()
  }
  const replacements: Array<[string, string]> = [[workspace, '<workspace>'], ...(options.scrub ?? [])]
  const scrub = (text: string): string => replacements.reduce((acc, [from, to]) => (from === '' ? acc : acc.replaceAll(from, to)), text)
  return { system: scrub(captured.system), tools: captured.tools.map(tool => ({ name: tool.name, description: scrub(tool.description) })), model: captured.model }
}

/** Markdown for one surface's captured prompt. */
export function renderSystemPromptDoc(surface: string, description: string, captured: CapturedSystemPrompt): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return [
    `# Current system prompt: ${surface}`,
    '',
    `<!-- Generated on ${stamp} by the system-prompt capture (see ../README.md). Do not edit; regenerate. -->`,
    '',
    `What the model receives on the first turn of a new session on the ${surface} surface (${description}), after path scrubbing.`,
    'Temporary paths are shown as `<workspace>`, `<dsh-home>` and `<acryl-repo>`. The tool list follows the system prompt.',
    '',
    '## System prompt',
    '',
    '```text',
    captured.system.trimEnd(),
    '```',
    '',
    `## Tools (${captured.tools.length})`,
    '',
    '| Tool | Description (first line) |',
    '| --- | --- |',
    ...captured.tools.map(tool => `| \`${tool.name}\` | ${tool.description.split('\n')[0]?.replaceAll('|', '\\|').slice(0, 160) ?? ''} |`),
    '',
  ].join('\n')
}
