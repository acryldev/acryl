/**
 * The app lifecycle on real engines (spec 036): an app IS its Blend. Create an app with a plugin in its extensions/, start it (the plugin installs itself),
 * record it with /blend snapshot (into the app folder), create a second app from it (like a fresh clone of the app's git repository), and start that one:
 * its plugins install themselves too, from the app's own files, with the lock verified.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { planNewApp, writeNewApp } from '../src/app/new-app.ts'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'
import { fileURLToPath } from 'node:url'

const organizer = fileURLToPath(new URL('../../../examples/acryl-organizer/', import.meta.url))
const saved = { ...process.env }
const temporary: string[] = []
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
  await Promise.all(temporary.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

async function start(app: string) {
  for (const key of ['DSH_HOME', 'ACRYL_WEB_PORT', 'ACRYL_INSTANCE', 'ACRYL_LOCAL_PRODUCT_NAME', 'ACRYL_BLUEPRINT']) delete process.env[key]
  process.env.ACRYL_HOME = app
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open'], exit: () => {} }) },
  })
  const tools = async () => (await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)
  // The startup pass runs one tick after boot and installs the app's own extensions; wait for it.
  const deadline = Date.now() + 90_000
  while (!(await tools()).includes('todo_add') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250))
  const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: `app-${String(Date.now())}`, attachment: 'owner', cwd: app })
  const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(await bridge.open()))
  const commands = host.ctx.get('commands' as never) as unknown as {
    execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string, text?: string } } | undefined>
  }
  return {
    tools,
    run: async (line: string) => (await commands.execute(agent, line, [], new AbortController().signal))?.result,
    async stop() { await bridge.dispose(); await host.dispose() },
  }
}

describe('an app is its Blend', () => {
  it('installs its own plugins at start, records into its own folder, and a second app created from it starts with the same plugins', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'acryl-app-lifecycle-')))
    temporary.push(root)
    const launcher = '/framework/scripts/blank.mjs'

    // App A: created by `acryl new`, with a plugin committed in its extensions/ (what the builder inside would have written).
    const a = join(root, 'planner')
    writeNewApp(planNewApp(a, { title: 'Planner', launcher }), { git: false })
    cpSync(organizer, join(a, 'extensions', 'acryl-organizer'), { recursive: true, filter: source => !source.includes('/tests') })
    let app = await start(a)
    try {
      expect(await app.tools()).toContain('todo_add')   // installed by the startup pass, nobody typed /reload
      const snapshot = await app.run('/blend snapshot')
      expect(snapshot?.kind, String(snapshot?.text)).toBe('success')
      expect(snapshot?.text).toContain(`Recorded the app in ${a}`)
      expect(readFileSync(join(a, 'blend.yaml'), 'utf8')).toMatch(/name: acryl-organizer/u)
      expect(readFileSync(join(a, 'blend.yaml'), 'utf8')).toMatch(/^# Planner: what this app is/u)   // the user's definition is kept
      expect(JSON.parse(readFileSync(join(a, 'blend.lock.json'), 'utf8')).modules).toEqual([expect.objectContaining({ name: 'acryl-organizer', origin: 'local', source: 'extensions/acryl-organizer' })])
      expect((await app.run('/blend verify'))?.text).toContain('matches its lock')
      expect(existsSync(join(a, '.acryl'))).toBe(false)   // nothing written into a hidden side folder: the app folder is the Blend
      // Saved from its own chat into its own repository: the app's files, never its runtime data.
      Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' })
      const saved = await app.run('/app save the planner with its organizer')
      expect(saved?.kind, String(saved?.text)).toBe('success')
      expect(saved?.text).toMatch(/Saved [0-9a-f]{8}\. It has no remote yet/u)
      const tracked = spawnSync('git', ['ls-files'], { cwd: a, encoding: 'utf8' }).stdout.split('\n')
      expect(tracked).toContain('blend.lock.json')
      expect(tracked.some(file => file.startsWith('.dsh/'))).toBe(false)
    } finally { await app.stop() }

    // App B: created from A (what a fresh clone of A's repository amounts to: definition, lock and extensions, nothing installed).
    const b = join(root, 'planner-eu')
    const source = { manifestText: readFileSync(join(a, 'blend.yaml'), 'utf8'), lockText: readFileSync(join(a, 'blend.lock.json'), 'utf8') }
    writeNewApp(planNewApp(b, { title: 'Planner EU', launcher, from: source }), { git: false, extensionsFrom: join(a, 'extensions') })
    app = await start(b)
    try {
      expect(await app.tools()).toContain('meeting_book')
      expect((await app.run('/blend verify'))?.text).toContain('matches its lock')
    } finally { await app.stop() }
  }, 300_000)
})
