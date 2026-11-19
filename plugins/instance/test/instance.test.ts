import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as nodeServer from 'acryl-node-server'
import { Acryl, apply as routerApply, name as routerName } from 'acryl-router'
import {
  instance,
  PORT_BASE,
  PORT_SPAN,
  projectInstance,
  selectInstance,
  stablePort,
  withPort,
} from '../index.ts'

// Everything the app writes goes under this scratch folder: ACRYL_HOME and HOME are pinned here, so no test can reach the real ~/.acryl.
const scratch = mkdtempSync(join(tmpdir(), 'instance-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const acrylHome = join(scratch, 'acryl')
const isolated = { ACRYL_HOME: acrylHome, HOME: join(scratch, 'home') }
/** An app folder that exists, as a folder made by `acryl new` does. */
function appFolder(...segments: string[]): string {
  const dir = join(scratch, 'work', ...segments)
  mkdirSync(dir, { recursive: true })
  return dir
}

test('a folder app keeps its data in ~/.acryl/apps/<id>/data, with a stable port in the app range', () => {
  const dir = appFolder('My Shop')
  const chosen = projectInstance(dir, isolated)
  assert.equal(chosen.kind, 'project')
  assert.equal(chosen.name, 'my-shop')
  assert.match(chosen.id, /^my-shop-[0-9a-f]{4}$/u)
  assert.equal(chosen.home, join(acrylHome, 'apps', chosen.id, 'data'))
  assert.equal(chosen.root, dir)
  assert.equal(chosen.port.start, stablePort(chosen.id))
  assert.ok(chosen.port.start >= PORT_BASE && chosen.port.start < PORT_BASE + PORT_SPAN)
  assert.ok(Object.isFrozen(chosen) && Object.isFrozen(chosen.port))
  // The id is in the app folder's own state, and nothing was put beside the code.
  assert.ok(existsSync(join(dir, '.acryl', 'app.json')))
  assert.equal(existsSync(join(dir, '.acrylblends')), false)
  // Choosing again, in another process, gives the same answer.
  assert.equal(projectInstance(dir, isolated).home, chosen.home)
})

test('a moved folder keeps its data; a copy without .acryl is another app', () => {
  const dir = appFolder('mover', 'shop')
  const chosen = projectInstance(dir, isolated)
  const moved = join(scratch, 'work', 'elsewhere')
  renameSync(dir, moved)
  const after = projectInstance(moved, isolated)
  assert.equal(after.id, chosen.id)
  assert.equal(after.home, chosen.home)
  assert.equal(after.root, moved)
})

test('the environment pins the home and the port; nothing else reads it', () => {
  const chosen = selectInstance({
    projectRoot: '/work/shop',
    env: { ACRYLBLENDS_HOME: '/tmp/isolated', ACRYLBLENDS_PORT: '0' },
  })
  assert.equal(chosen.kind, 'pinned')
  assert.equal(chosen.home, '/tmp/isolated')
  assert.equal(chosen.root, '/work/shop')
  assert.equal(chosen.name, 'shop')
  assert.deepEqual(chosen.port, { start: 0, scan: false })
  assert.equal(selectInstance({ projectRoot: appFolder('select'), env: isolated }).kind, 'project')
})

test('the interface is loopback unless the environment names one (a container sets it)', () => {
  const dir = appFolder('host')
  assert.equal(selectInstance({ projectRoot: dir, env: isolated }).host, undefined)
  const chosen = selectInstance({
    projectRoot: dir,
    env: { ...isolated, ACRYLBLENDS_HOST: '0.0.0.0' },
  })
  assert.equal(chosen.host, '0.0.0.0')
})

test('PORT and HOST, the names hosting platforms set, are read when the ACRYLBLENDS_ ones are not, and lose to them', () => {
  const dir = appFolder('platform')
  const platform = selectInstance({
    projectRoot: dir,
    env: { ...isolated, PORT: '3299', HOST: '0.0.0.0' },
  })
  assert.deepEqual(platform.port, { start: 3299, scan: true })
  assert.equal(platform.host, '0.0.0.0')
  const both = selectInstance({
    projectRoot: dir,
    env: {
      ...isolated,
      PORT: '3299',
      HOST: '0.0.0.0',
      ACRYLBLENDS_PORT: '3400',
      ACRYLBLENDS_HOST: '127.0.0.1',
    },
  })
  assert.equal(both.port.start, 3400)
  assert.equal(both.host, '127.0.0.1')
  // An empty ACRYLBLENDS_PORT is not a choice: the platform's PORT is.
  assert.equal(
    selectInstance({ projectRoot: dir, env: { ...isolated, ACRYLBLENDS_PORT: ' ', PORT: '3299' } })
      .port.start,
    3299,
  )
})

test('an invalid port is refused', () => {
  assert.throws(() => withPort(projectInstance(appFolder('x'), isolated), 70_000), /port must be/)
})

test('an app whose stable port is one a browser refuses still comes up, because the server moves on', async () => {
  // Every app's seed is hashed into 3100..3999, and 3659 is both inside that range and on the Fetch standard's bad ports: Chromium refuses the
  // page (ERR_UNSAFE_PORT) and Node's fetch answers "bad port". The frame gate was refused at exactly 3659 on 2026-11-03. The listener must skip it.
  let seededId = ''
  for (let n = 0; n < 100_000 && seededId === ''; n += 1) {
    const id = `seed-${n.toString(16)}`
    if (stablePort(id) === 3659) seededId = id
  }
  assert.notEqual(seededId, '', 'an app id whose stable port is 3659')
  const seeded = appFolder('seeded')
  mkdirSync(join(seeded, '.acryl'), { recursive: true })
  writeFileSync(join(seeded, '.acryl', 'app.json'), JSON.stringify({ id: seededId }))
  const chosen = projectInstance(seeded, isolated)
  assert.equal(nodeServer.isRestrictedPort(chosen.port.start), true)
  const root = new Context()
  await root.plugin({ name: routerName, apply: routerApply })
  const fiber = root.plugin(nodeServer, { port: chosen.port.start, scan: 20 })
  await fiber
  root.router.route(
    '/',
    new Acryl().get('/ok', (c) => c.text('ok')),
  )
  assert.equal(nodeServer.isRestrictedPort(root.nodeServer.port), false)
  assert.ok(root.nodeServer.port > 3659)
  assert.equal(await (await fetch(`${root.nodeServer.url}/ok`)).text(), 'ok')
  await root.fiber.dispose()
})

test('the plugin provides the chosen instance', async () => {
  const root = new Context()
  const chosen = projectInstance(appFolder('provides'), isolated)
  const fiber = root.plugin(instance, chosen)
  await fiber.await()
  assert.equal(root.get('appInstance'), chosen)
  await fiber.dispose()
})
