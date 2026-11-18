// What runs in production: the development tools (the door, the agent panel, the PTY driver) start nothing with NODE_ENV=production, in one app that mounts all of them; the same app
// in development has them. The templates' own switches (the door row, and the `extensions` row of the web templates) are checked by reading their `src/app.ts`.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as door from '../../acryl-door/src/index.ts'
import * as nodeServer from '../../acryl-node-server/src/index.ts'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../../agent/index.ts'
import * as panel from '../../agent-panel/index.ts'
import { builder } from '../../builder/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as driverPty from '../index.ts'
import type { PtySpawn } from '../spawn.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

const OWN = { 'sec-fetch-site': 'same-origin' }
const noSpawn: PtySpawn = () => {
  throw new Error('a terminal was started')
}

/** One app with every development tool mounted, the way `blend.yaml` mounts them, in the given environment. */
async function boot(nodeEnv: string) {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = nodeEnv
  delete process.env.ACRYL_DOOR
  const root = mkdtempSync(join(tmpdir(), 'production-'))
  const app = new Context()
  const fibers: Array<ReturnType<Context['plugin']>> = []
  const mount = async (fiber: ReturnType<Context['plugin']>) => {
    fibers.push(fiber)
    await fiber.await()
  }
  await mount(app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })))
  await mount(app.plugin(router))
  await mount(app.plugin(state))
  await mount(app.plugin(nodeServer, { hostname: '127.0.0.1', port: 0 }))
  await mount(
    app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
  )
  for (const plugin of [model, tools, memory, agent]) await mount(app.plugin(plugin))
  await mount(app.plugin(builder, {}))
  await mount(app.plugin(door, {}))
  await mount(app.plugin(panel, { drivers: [] }))
  await mount(app.plugin(driverPty, { spawn: noSpawn, programs: { claude: [] } }))
  await mount(
    app.plugin({
      name: 'page',
      inject: ['router'],
      apply(ctx: Context) {
        ctx.router.route(
          '/',
          new router.Acryl().get('/', (c) =>
            c.html('<!doctype html><html><body><h1>Home</h1></body></html>'),
          ),
        )
      },
    }),
  )
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(root, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return { app, root }
}

test('in production the door, the agent panel and the PTY driver start nothing: no service, no route, no file, no script in the page', async () => {
  const { app, root } = await boot('production')
  assert.equal((app as unknown as { door?: unknown }).door, undefined)
  assert.equal((app as unknown as { drivers?: unknown }).drivers, undefined)
  assert.equal(existsSync(join(root, '.acryl')), false, 'the door wrote its folder')
  assert.doesNotMatch(
    await (await app.router.request('/')).text(),
    /agent-panel|\.acryl|driver-pty/u,
  )
  assert.equal((await app.router.request('/api/agent-panel/session', { headers: OWN })).status, 404)
  assert.equal(
    (
      await app.router.request('/api/driver-pty/sessions', {
        method: 'POST',
        headers: { ...OWN, 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    404,
  )
})

test('the same app in development has all three (so the test above is sensitive)', async () => {
  const { app, root } = await boot('development')
  assert.ok((app as unknown as { door?: unknown }).door !== undefined, 'the door is mounted')
  assert.equal(existsSync(join(root, '.acryl', 'door.json')), true)
  assert.match(await (await app.router.request('/')).text(), /agent-panel/u)
  assert.equal((await app.router.request('/api/agent-panel/session', { headers: OWN })).status, 200)
})

test('the web templates leave the door out in production and start their plugins read-only (their features stay, nothing can be installed), and the agent template also leaves out its agent, builder and extensions unless ACRYL_PRODUCTION_KEEP names them', () => {
  const read = (template: string) =>
    readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'packages',
        'cli',
        'templates',
        template,
        'src',
        'app.ts',
      ),
      'utf8',
    )
  for (const template of ['blank', 'nodejs', 'notes', 'chat']) {
    const text = read(template)
    assert.match(
      text,
      /NODE_ENV === 'production' \? \{ readOnly: true \}/u,
      `${template} lets plugins be installed in production`,
    )
    assert.match(text, /leaveOut\.add\('acryl-door'\)/u, `${template} keeps the door in production`)
  }
  // The chat template spends the model key for whoever reaches it: in production it is closed unless it has a token or is made public on purpose.
  const chatRoutes = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'packages',
      'cli',
      'templates',
      'chat',
      'src',
      'routes.ts',
    ),
    'utf8',
  )
  assert.match(
    chatRoutes,
    /chatAccess\(process\.env\)/u,
    'chat mounts its routes without the access gate',
  )
  const agentText = read('agent')
  assert.match(
    agentText,
    /if \(!assistant && \(process\.env\.NODE_ENV === 'production' \|\| process\.env\.ACRYL_DOOR === 'off'\)\)\s*leaveOut\.add\('acryl-door'\)/u,
    'the agent template leaves the door out in production unless the Assistant (page-only) needs it',
  )
  assert.doesNotMatch(
    agentText,
    /leaveOut\.add\('extensions'\)/u,
    'the agent template is expected to keep extensions: the guide says so',
  )
})
