import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { integrityOf, packFolder } from '@webboxes/plugin-hub'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../../agent/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { builder } from '../index.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step()
})

/** An app with the builder: its project folder and its home are throwaway folders. */
async function boot() {
  const root = mkdtempSync(join(tmpdir(), 'builder-root-'))
  const home = join(root, '.acrylblends')
  const app = new Context()
  const fibers = [
    app.plugin(instance, pinnedInstance(home, { root })),
    app.plugin(router),
    app.plugin(state),
    app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
    app.plugin(model),
    app.plugin(tools),
    app.plugin(memory),
    app.plugin(agent),
    app.plugin(builder, {}),
  ]
  for (const fiber of fibers) await fiber.await()
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  })
  const ask = async (question: string) => {
    const result = await app.agent.run(question)
    return result.status === 'completed'
      ? result.output
      : `budget exceeded after ${result.steps} steps`
  }
  const get = async (path: string) => {
    const response = await app.router.request(path)
    return { status: response.status, body: response.ok ? await response.json() : undefined }
  }
  return { app, root, ask, get }
}

test('the agent builds a route plugin, updates it, survives a broken update, and removes it', async () => {
  const { ask, get, root } = await boot()
  assert.equal(await ask('create route hello /hello Hello'), 'hello: installed, active.')
  assert.deepEqual(await get('/hello'), { status: 200, body: { text: 'Hello' } })

  assert.equal(await ask('update route hello /hello Bonjour'), 'hello: updated, active.')
  assert.deepEqual((await get('/hello')).body, { text: 'Bonjour' })

  assert.equal(
    await ask('break plugin hello'),
    'Refused: hello refuses to start. Previous version restored: true.',
  )
  assert.deepEqual((await get('/hello')).body, { text: 'Bonjour' })

  assert.equal(await ask('list plugins'), 'hello (active)')
  assert.equal(await ask('remove plugin hello'), 'hello: done.')
  assert.equal((await get('/hello')).status, 404)
  assert.equal(existsSync(join(root, 'plugins', 'hello')), false)
})

test('package_plugin turns an extension into a standalone package with Cordis as a peer', async () => {
  const { app, ask, root } = await boot()
  await ask('create route hello /hello Hello')
  const packaged = (await app.tools.call('package_plugin', { name: 'hello' })) as { dir: string }
  assert.equal(packaged.dir, join(root, 'plugin-packages', 'hello'))
  const manifest = JSON.parse(readFileSync(join(packaged.dir, 'package.json'), 'utf8'))
  assert.deepEqual(
    [manifest.name, manifest.peerDependencies, manifest.dependencies],
    ['hello', { '@deepseek-ai/cordis': '4.0.4' }, undefined],
  )
  assert.ok(existsSync(join(packaged.dir, 'index.ts')))
  await assert.rejects(app.tools.call('package_plugin', { name: 'ghost' }), /has no index\.ts/)
})

test('a package carries its contract and every file of the plugin, so the registry and other apps read it right', async () => {
  const { app, ask, root } = await boot()
  await ask('create route hello /hello Hello')
  writeFileSync(join(root, 'plugins', 'hello', 'plugin.json'), '{"name":"hello"}\n')
  writeFileSync(join(root, 'plugins', 'hello', 'defaults.json'), '{"text":"Hello"}\n')
  writeFileSync(join(root, 'plugins', 'hello', 'helper.js'), 'export const helper = 1\n')
  const { dir } = (await app.tools.call('package_plugin', { name: 'hello' })) as { dir: string }
  const packed = packFolder(dir)
  for (const file of [
    'index.ts',
    'plugin.json',
    'defaults.json',
    'helper.js',
    'README.md',
    'package.json',
  ]) {
    assert.ok(packed.files.includes(file), `${file} is not among ${packed.files.join(', ')}`)
  }
  const acryl = packed.manifest.acryl as {
    requires: { host: string[] }
    provides: { host: string[] }
  }
  assert.deepEqual(acryl.requires.host, ['router'])
  assert.deepEqual(acryl.provides.host, [])
  assert.deepEqual(packed.manifest.keywords, ['cordis', 'cordis-plugin', 'acrylblends'])
})

test('packing a plugin is deterministic: twice, or with Windows line endings, the same sha512 and digest', async () => {
  const { app, ask, root } = await boot()
  await ask('create route hello /hello Hello')
  const pack = async () =>
    (await app.tools.call('package_plugin', { name: 'hello' })) as {
      dir: string
      tarball: string
      integrity: string
      digest: string
      version: string
    }
  const first = await pack()
  assert.equal(first.version, '0.1.0')
  assert.equal(first.tarball, join(root, 'plugin-packages', 'hello-0.1.0.tgz'))
  assert.equal(first.integrity, integrityOf(readFileSync(first.tarball)))
  assert.match(first.digest, /^[0-9a-f]{64}$/)
  await new Promise((done) => setTimeout(done, 1100))
  assert.equal(
    (await pack()).integrity,
    first.integrity,
    'the time it was packed is not in the bytes',
  )

  const entry = join(root, 'plugins', 'hello', 'index.ts')
  writeFileSync(entry, readFileSync(entry, 'utf8').replaceAll('\n', '\r\n'))
  const windows = await pack()
  assert.equal(windows.integrity, first.integrity, 'line endings are not in the bytes')
  assert.equal(windows.digest, first.digest)
  assert.equal(
    readFileSync(entry, 'utf8').includes('\r\n'),
    true,
    "the person's own file is left as it is",
  )
})

test('a package keeps its version, so a person bumps it deliberately', async () => {
  const { app, ask, root } = await boot()
  await ask('create route hello /hello Hello')
  await app.tools.call('package_plugin', { name: 'hello' })
  const file = join(root, 'plugin-packages', 'hello', 'package.json')
  writeFileSync(
    file,
    JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), version: '0.3.0' }),
  )
  const again = (await app.tools.call('package_plugin', { name: 'hello' })) as {
    version: string
    tarball: string
  }
  assert.equal(again.version, '0.3.0')
  assert.ok(again.tarball.endsWith('hello-0.3.0.tgz'))
})

test('a plugin that would not work on every OS is refused, and no package is left', async () => {
  const { app, ask, root } = await boot()
  await ask('create route hello /hello Hello')
  writeFileSync(join(root, 'plugins', 'hello', 'aux.txt'), 'x\n')
  await assert.rejects(
    app.tools.call('package_plugin', { name: 'hello' }),
    /aux\.txt.*reserved by Windows/,
  )
  assert.equal(existsSync(join(root, 'plugin-packages', 'hello')), false)
})

test('writes stay inside the plugin folder and only take source files', async () => {
  const { app } = await boot()
  await assert.rejects(
    app.tools.call('write_plugin', { name: 'x', files: { '../escape.ts': '' } }),
    /inside the plugin folder/,
  )
  await assert.rejects(
    app.tools.call('write_plugin', { name: 'x', files: { 'run.sh': 'rm -rf /' } }),
    /only .ts/,
  )
  await assert.rejects(
    app.tools.call('write_plugin', { name: 'Bad', files: { 'index.ts': '' } }),
    /lowercase/,
  )
})

test('the builder refuses to write anywhere that is not an extensions source', async () => {
  const root = mkdtempSync(join(tmpdir(), 'builder-root-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const app = new Context()
  for (const plugin of [model, tools, memory, agent]) await app.plugin(plugin).await()
  await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
  await app
    .plugin(extensions, { sources: [{ dir: join(root, 'elsewhere'), trust: 'install' }] })
    .await()
  await assert.rejects(app.plugin(builder, {}).await(), /not an extensions source/)
})

test('a plugin installed live reads a service as a property (ctx.router) and builds its routes with the acrylblends of the app', async () => {
  const { app, root } = await boot()
  const dir = join(root, 'plugins', 'probe')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.ts'),
    `import { Acryl } from 'acrylblends'
export const name = 'probe'
export const inject = ['router']
export function apply(ctx) {
  ctx.router.route('/', new Acryl().get('/probe', (c) => c.json({ ok: true })))
}
`,
  )
  const installed = (await app.extensions.install(dir)) as { ok: boolean; errors?: string[] }
  assert.equal(installed.ok, true, installed.errors?.join('; '))
  assert.equal((await app.router.request('/probe')).status, 200)
  await app.extensions.remove('probe')
  assert.equal((await app.router.request('/probe')).status, 404)
})

test("a live plugin's check runs with the plugin context: ctx.router reads as in apply, and a failing check rolls the install back", async () => {
  const { app, root } = await boot()
  const write = (name: string, status: number) => {
    const dir = join(root, 'plugins', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'index.ts'),
      `import { Acryl } from 'acrylblends'
export const name = '${name}'
export const inject = ['router']
export function apply(ctx) {
  ctx.router.route('/', new Acryl().get('/${name}', (c) => c.json({ ok: true }, ${status})))
}
export async function check(ctx) {
  const reply = await ctx.router.request('/${name}')
  if (!reply.ok) throw new Error('answered ' + reply.status)
}
`,
    )
    return dir
  }
  const good = (await app.extensions.install(write('checked', 200))) as {
    ok: boolean
    errors?: string[]
  }
  assert.equal(good.ok, true, good.errors?.join('; '))
  const bad = (await app.extensions.install(write('unchecked', 500))) as {
    ok: boolean
    stage?: string
  }
  assert.equal(bad.ok, false)
  assert.equal(bad.stage, 'verify')
  assert.equal((await app.router.request('/unchecked')).status, 404)
})

test('a live plugin renders a page with acrylblends/jsx (the call JSX compiles to; Node does not compile JSX syntax)', async () => {
  const { app, root } = await boot()
  const dir = join(root, 'plugins', 'about')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.ts'),
    `import { Acryl } from 'acrylblends'
import { jsx } from 'acrylblends/jsx'
export const name = 'about'
export const inject = ['router']
export function apply(ctx) {
  ctx.router.route('/', new Acryl().get('/about', (c) => c.html(jsx('main', null, jsx('h1', null, 'About')).toString())))
}
`,
  )
  const installed = (await app.extensions.install(dir)) as { ok: boolean; errors?: string[] }
  assert.equal(installed.ok, true, installed.errors?.join('; '))
  const reply = await app.router.request('/about')
  assert.equal(reply.status, 200)
  assert.match(await reply.text(), /<main><h1>About<\/h1><\/main>/)
})

test('with the state service mounted, what is installed is a cell that follows every install and removal', async () => {
  const { app, ask } = await boot()
  const cell = app.state.find<Array<{ name: string; state: string }>>('extensions')
  assert.ok(cell, 'the extensions cell exists')
  assert.deepEqual(cell.get(), [])
  await ask('create route hello /hello Hello')
  assert.deepEqual(
    cell.get().map((entry) => [entry.name, entry.state]),
    [['hello', 'active']],
  )
  await ask('remove plugin hello')
  assert.deepEqual(cell.get(), [])
})
