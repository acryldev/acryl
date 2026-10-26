/**
 * A Web page opened while the startup pass installs an app's own plugins (specs/001 T097, on real engines): the index served before the pass
 * settles lacks the app's client plugin, so it carries acryl-plugin-context's hold script, and the startup route answers once the pass
 * settles (cookie and origin checked like the Host API); the index served after it has the plugin and no hold.
 */
import { cpSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { STARTUP_PATH } from 'acryl-plugin-context'
import { afterEach, describe, expect, it } from 'vitest'
import { planNewApp, writeNewApp } from '../src/app/new-app.ts'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const example = fileURLToPath(new URL('../../../plugins/acryl-plugin-context/example-plugins/packages/client-slot-header-action/', import.meta.url))
const PLUGIN = 'acryl-example-client-notes'
const saved = { ...process.env }
const temporary: string[] = []
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
  await Promise.all(temporary.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

interface StartupReport { status: string, lines: string[] }

describe('the Web index during the startup pass', () => {
  it('holds a page rendered before the app\'s plugins are installed and serves the full graph after', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'acryl-web-hold-')))
    temporary.push(root)
    const app = join(root, 'headerapp')
    writeNewApp(planNewApp(app, { title: 'Header App', launcher: '/framework/scripts/blank.mjs' }), { git: false })
    cpSync(example, join(app, 'plugins', 'client-slot-header-action'), { recursive: true, filter: source => !source.includes('/tests') && !source.includes('node_modules') })
    for (const key of ['DSH_HOME', 'ACRYL_WEB_PORT', 'ACRYL_WEB_HOST', 'ACRYL_WEB_TRUSTED_HOSTS', 'ACRYL_INSTANCE', 'ACRYL_LOCAL_PRODUCT_NAME', 'ACRYL_BLUEPRINT']) delete process.env[key]
    process.env.ACRYL_HOME = app
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: ctx => { provideCmdline(ctx, { args: ['--no-open'], exit: () => {} }) },
    })
    try {
      const ctx = host.ctx
      const web = ctx.get('webServer' as never) as unknown as { host: string, port: number, renderIndex(html: string): string }
      const connection = ctx.get('connection')!
      const pluginContext = ctx.get('pluginContext' as never) as unknown as { startupSettled: Promise<StartupReport> }
      const index = () => web.renderIndex('<html><head></head><body></body></html>')
      const origin = `http://127.0.0.1:${String(web.port)}`

      // The surface prints its URL here. The pass installs with pnpm, which takes seconds, so it has not settled yet.
      const early = await Promise.race([pluginContext.startupSettled.then(() => 'settled'), Promise.resolve('running')])
      expect(early, 'the startup pass settled before the surface served: this test cannot observe the window').toBe('running')
      const before = index()
      expect(before).not.toContain(PLUGIN)
      expect(before).toContain(STARTUP_PATH)

      // Unauthenticated, and authenticated but from another site: refused like the Host API.
      expect((await fetch(`${origin}${STARTUP_PATH}`)).status).toBe(401)
      const exchange = await fetch(connection.authenticatedUrl(origin), { redirect: 'manual' })
      const cookie = (exchange.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      expect(cookie).not.toBe('')
      expect((await fetch(`${origin}${STARTUP_PATH}`, { headers: { cookie, 'sec-fetch-site': 'cross-site' } })).status).toBe(403)

      // The held page's request answers 204 once the pass settles, and not before.
      const held = fetch(`${origin}${STARTUP_PATH}`, { headers: { cookie, origin } })
      const report = await pluginContext.startupSettled
      expect(report).toEqual({ status: 'done', lines: [`installed the app's plugins ${PLUGIN}`] })
      expect((await held).status).toBe(204)

      // The reloaded page: the full graph, no hold.
      const after = index()
      expect(after).toContain(PLUGIN)
      expect(after).not.toContain(STARTUP_PATH)
    } finally { await host.dispose() }
  }, 300_000)
})
