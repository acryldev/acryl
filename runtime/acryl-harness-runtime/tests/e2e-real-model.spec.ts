/**
 * OPT-IN real-model end-to-end run of the self-extension loop (spec 037). Skipped unless
 * `ACRYL_E2E_PROMPTS` is set: it spends real tokens.
 *
 *   ACRYL_E2E_PROMPTS='build a kanban ...||change it ...||remove it' \
 *   ACRYL_E2E_LOG=/tmp/e2e.jsonl ACRYL_E2E_KEY_FILE=~/.secure-storage/llmproviders/deepseek/deepseek.json \
 *   corepack pnpm exec vitest run tests/e2e-real-model.spec.ts
 *
 * Boots the real web engine in a throwaway DSH_HOME, opens one session on the `standard` preset (the
 * composition the Web UI gives a session), sends each prompt in turn and appends every session event to the
 * log file. The key is read from the file into the process environment and never logged.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import { it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const prompts = process.env.ACRYL_E2E_PROMPTS

it.skipIf(prompts === undefined)('the agent builds, changes, extends and removes extensions for real', async () => {
  const keyFile = (process.env.ACRYL_E2E_KEY_FILE ?? '').replace(/^~/u, homedir())
  process.env.DEEPSEEK_API_KEY = (JSON.parse(readFileSync(keyFile, 'utf8')) as { deepseek_api_key: string }).deepseek_api_key
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'acryl-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'acryl-e2e-ws-'))
  const logFile = process.env.ACRYL_E2E_LOG ?? join(workspace, 'e2e.jsonl')
  const log = (entry: unknown): void => appendFileSync(logFile, `${JSON.stringify(entry)}\n`)
  log({ workspace })

  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'e2e', attachment: 'owner', cwd: workspace })
  try {
    const sessionId = await bridge.open()
    await bridge.selectModel({ sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    const presets = host.ctx.get('agentPresets' as never) as { select(agent: unknown, id: string): Promise<string> }
    const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
    await presets.select(agent, 'standard')

    let turnEnded: (() => void) | undefined
    await bridge.subscribeEvents(sessionId, event => {
      const { type, data } = event as { type: string; data?: unknown }
      log({ ev: type, brief: JSON.stringify(data ?? {}).slice(0, 400) })
      if (type === 'turn/end') turnEnded?.()
    })
    for (const prompt of (prompts ?? '').split('||')) {
      log({ prompt })
      const ended = new Promise<void>(resolve => { turnEnded = resolve })
      await bridge.submitPrompt({ sessionId, text: prompt })
      await Promise.race([ended, new Promise(resolve => setTimeout(resolve, 420_000))])
    }
    const extensions = join(workspace, '.acryl-extensions')
    log({ done: true, extensions: existsSync(extensions) ? readdirSync(extensions) : [] })
  } finally {
    await bridge.dispose()
    await host.dispose()
  }
}, 1_800_000)
