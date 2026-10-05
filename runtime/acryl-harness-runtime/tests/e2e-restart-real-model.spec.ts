/**
 * OPT-IN real-model end-to-end run of "the app survives a restart" (spec 001, T059). Skipped unless `ACRYL_E2E_RESTART_PROMPTS` is set: it spends real tokens.
 *
 * One pinned app home is booted once per prompt, with a full stop in between, and every turn must end `completed` (no error, no interrupted tool call). It
 * exists because the first live restart of an app with an agent-authored extension found what every single-boot test had missed: an extension that listed
 * the framework under `dependencies` brought a second copy into the profile, and every tool call failed after the restart.
 *
 *   ACRYL_HOME=/some/throwaway/app-folder ACRYL_REQUIRE_ISOLATED_HOME=1 HOME=/some/throwaway/home \
 *   ACRYL_E2E_KEY_FILE=~/.secure-storage/llmproviders/deepseek/deepseek.json \
 *   ACRYL_E2E_RESTART_PROMPTS='build a tool plugin ... in the extensions folder, install it||call hello_acryl and report what it returned' \
 *   ACRYL_E2E_RESTART_EXPECT='hello after restart' ACRYL_E2E_LOG=/tmp/restart.jsonl corepack pnpm exec vitest run tests/e2e-restart-real-model.spec.ts
 *
 * `ACRYL_E2E_RESTART_EXPECT` is text the LAST turn's tool results must contain: a model that completes without doing the work cannot pass.
 * Each session runs on the `standard` preset, the composition the Web UI gives a session (file and shell tools included).
 *
 * The caller pins the home (`scripts/live-run.mjs` shows the isolated environment to use); the key is read from the file into the process environment and
 * never logged.
 */
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const prompts = process.env.ACRYL_E2E_RESTART_PROMPTS

it.skipIf(prompts === undefined)('every turn completes across restarts of one app home', async () => {
  expect(process.env.ACRYL_HOME, 'pin ACRYL_HOME to a throwaway app folder').toBeTruthy()
  const keyFile = (process.env.ACRYL_E2E_KEY_FILE ?? '').replace(/^~/u, homedir())
  process.env.DEEPSEEK_API_KEY = (JSON.parse(readFileSync(keyFile, 'utf8')) as { deepseek_api_key: string }).deepseek_api_key
  const logFile = process.env.ACRYL_E2E_LOG ?? join(mkdtempSync(join(tmpdir(), 'acryl-e2e-restart-')), 'restart.jsonl')
  const log = (entry: unknown): void => appendFileSync(logFile, `${JSON.stringify(entry)}\n`)
  const endings: Array<{ prompt: string, reason: unknown }> = []
  let lastResults = ''

  for (const prompt of (prompts ?? '').split('||')) {
    const workspace = mkdtempSync(join(tmpdir(), 'acryl-e2e-restart-ws-'))
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'e2e-restart', attachment: 'owner', cwd: workspace })
    try {
      const sessionId = await bridge.open()
      await bridge.selectModel({ sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash' })
      const presets = host.ctx.get('agentPresets' as never) as { select(agent: unknown, id: string): Promise<string> }
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      await presets.select(agent, 'standard')
      lastResults = ''
      let ended: (() => void) | undefined
      let reason: unknown
      await bridge.subscribeEvents(sessionId, event => {
        const { type, data } = event as { type: string, data?: { reason?: unknown } }
        log({ ev: type, brief: JSON.stringify(data ?? {}).slice(0, 400) })
        if (type === 'tool/result') lastResults += JSON.stringify(data)
        if (type === 'turn/end') { reason = data?.reason; ended?.() }
      })
      log({ prompt })
      const done = new Promise<void>(resolve => { ended = resolve })
      await bridge.submitPrompt({ sessionId, text: prompt })
      await Promise.race([done, new Promise(resolve => setTimeout(resolve, 420_000))])
      endings.push({ prompt, reason })
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }
  expect(endings.map(ending => ending.reason)).toEqual(endings.map(() => ({ kind: 'completed' })))
  const expected = process.env.ACRYL_E2E_RESTART_EXPECT
  if (expected !== undefined) expect(lastResults).toContain(expected)
}, 1_800_000)
