import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { instance, pinnedInstance } from '../../instance/index.ts'
import { type ExtensionSource, extensions } from '../index.ts'
import { routerAliases } from '../resolve.ts'

/** The repository root: its node_modules has @deepseek-ai/cordis, as an app's project folder would. */
const appRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

async function boot(
  options: { home?: string; root?: string; sources?: (home: string) => ExtensionSource[] } = {},
) {
  const home = options.home ?? mkdtempSync(join(tmpdir(), 'extensions-test-'))
  const root = new Context()
  const chosen = pinnedInstance(home, { root: options.root ?? appRoot })
  const fibers = [
    root.plugin(instance, chosen),
    root.plugin(extensions, options.sources ? { sources: options.sources(home) } : {}),
  ]
  for (const fiber of fibers) await fiber.await()
  const stop = async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  }
  cleanup.push(stop)
  if (!options.home) cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  return { root, home, folder: join(home, 'extensions'), stop }
}

/** Write an extension that provides a `greeting` service built from a sibling file. */
function writeGreeter(
  folder: string,
  greeting: string,
  options: { throws?: boolean; syntaxError?: boolean } = {},
) {
  const dir = join(folder, 'greeter')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'words.ts'), `export const greeting = ${JSON.stringify(greeting)}\n`)
  writeFileSync(
    join(dir, 'index.ts'),
    options.syntaxError
      ? 'export const name = (\n'
      : `import { Context } from '@deepseek-ai/cordis'
import { greeting } from './words.ts'
export const name = 'greeter'
export function apply(ctx: Context) {
  if (typeof Context !== 'function') throw new Error('cordis did not resolve')
  ${options.throws ? "throw new Error('greeter refuses to start')" : "ctx.provide('greeting', greeting)"}
}
`,
  )
  return dir
}

test('installs a folder, mounts it, and reports it active', async () => {
  const { root, folder } = await boot()
  const dir = writeGreeter(folder, 'hello')
  const result = await root.extensions.install(dir)
  assert.equal(result.ok, true)
  assert.deepEqual(result.ok && [result.action, result.state], ['installed', 'active'])
  assert.equal(root.get('greeting'), 'hello')
  assert.deepEqual(
    root.extensions.list().map((entry) => [entry.name, entry.state]),
    [['greeter', 'active']],
  )
})

test('an update runs the new code, including a changed sibling file, without a restart', async () => {
  const { root, folder } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  const unchanged = await root.extensions.install(join(folder, 'greeter'))
  assert.equal(unchanged.ok && unchanged.action, 'unchanged')
  const updated = await root.extensions.install(writeGreeter(folder, 'bonjour'))
  assert.equal(updated.ok && updated.action, 'updated')
  assert.equal(root.get('greeting'), 'bonjour')
})

test('an update that fails to start brings the previous version back', async () => {
  const { root, folder } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  const broken = await root.extensions.install(writeGreeter(folder, 'never', { throws: true }))
  assert.equal(broken.ok, false)
  assert.equal(!broken.ok && broken.stage, 'activate')
  assert.equal(!broken.ok && broken.restoredPrevious, true)
  assert.match(!broken.ok ? (broken.errors[0] ?? '') : '', /refuses to start/)
  assert.equal(root.get('greeting'), 'hello')
  assert.deepEqual(
    root.extensions.list().map((entry) => entry.state),
    ['active'],
  )
})

test('an update that does not even import leaves the running version untouched', async () => {
  const { root, folder } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  const broken = await root.extensions.install(writeGreeter(folder, 'x', { syntaxError: true }))
  assert.equal(!broken.ok && broken.stage, 'import')
  assert.equal(!broken.ok && broken.restoredPrevious, true)
  assert.equal(root.get('greeting'), 'hello')
})

test('an extension waiting for a service is pending and names what it waits for', async () => {
  const { root, folder } = await boot()
  const dir = join(folder, 'needy')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.ts'),
    "export const name = 'needy'\nexport const inject = ['database']\nexport function apply() {}\n",
  )
  const result = await root.extensions.install(dir)
  assert.deepEqual(result.ok && [result.state, result.missing], ['pending', ['database']])
})

test('refuses a folder outside the sources, a bad name, a missing entry and a name mismatch', async () => {
  const { root, folder, home } = await boot()
  const outside = join(home, 'elsewhere', 'thing')
  mkdirSync(outside, { recursive: true })
  writeFileSync(
    join(outside, 'index.ts'),
    "export const name = 'thing'\nexport function apply() {}\n",
  )
  const refused = await root.extensions.install(outside)
  assert.match(!refused.ok ? refused.errors.join() : '', /not inside an extension source/)
  mkdirSync(join(folder, 'Bad_Name'), { recursive: true })
  assert.match(String(!(await root.extensions.install(join(folder, 'Bad_Name'))).ok), /true/)
  mkdirSync(join(folder, 'empty'), { recursive: true })
  const empty = await root.extensions.install(join(folder, 'empty'))
  assert.match(!empty.ok ? empty.errors.join() : '', /has no index\.ts/)
  const mismatch = join(folder, 'mismatch')
  mkdirSync(mismatch, { recursive: true })
  writeFileSync(
    join(mismatch, 'index.ts'),
    "export const name = 'other'\nexport function apply() {}\n",
  )
  const named = await root.extensions.install(mismatch)
  assert.match(!named.ok ? named.errors.join() : '', /must match/)
})

test('remove disposes the extension, and the ledger records every change in order', async () => {
  const { root, folder, home } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  await root.extensions.install(writeGreeter(folder, 'never', { throws: true }))
  const removed = await root.extensions.remove('greeter')
  assert.equal(removed.ok, true)
  assert.equal(root.get('greeting'), undefined)
  assert.equal(existsSync(join(home, 'extensions-staged', 'greeter')), false)
  assert.deepEqual(
    root.extensions.ledger().map((entry) => entry.kind),
    ['installed', 'refused', 'restored', 'removed'],
  )
  assert.equal((await root.extensions.remove('greeter')).ok, false)
})

test('a restart mounts what was installed; a trusted source installs new folders, a listed one only reports them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  const first = await boot({ home })
  await first.root.extensions.install(writeGreeter(first.folder, 'hello'))
  await first.stop()

  const project = join(home, 'project-extensions')
  const listed = join(project, 'later')
  mkdirSync(listed, { recursive: true })
  writeFileSync(
    join(listed, 'index.ts'),
    "export const name = 'later'\nexport function apply() {}\n",
  )
  const second = await boot({
    home,
    sources: (dir) => [
      { dir: join(dir, 'extensions'), trust: 'install' },
      { dir: project, trust: 'list' },
    ],
  })
  const summary = await second.root.extensions.ready
  assert.deepEqual(summary.installed, ['greeter'])
  assert.deepEqual(summary.pending, ['later'])
  assert.equal(second.root.get('greeting'), 'hello')
})

test('the record names a plugin by its place in the app, so a moved app finds it again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  const before = join(home, 'where-it-was')
  const dir = join(before, 'plugins', 'hello')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.ts'),
    "export const name = 'hello'\nexport function apply(ctx: any) { ctx.provide('greeting', 'hi') }\n",
  )
  const sources = (root: string) => () => [
    { dir: join(root, 'plugins'), trust: 'install' as const },
  ]
  const first = await boot({ home, root: before, sources: sources(before) })
  await first.root.extensions.ready
  assert.equal(first.root.get('greeting'), 'hi')
  await first.stop()
  // What was written names the folder inside the app and the staged copy inside the data home, with no absolute path of either.
  const record = JSON.parse(readFileSync(join(home, 'extensions.json'), 'utf8')) as Record<
    string,
    { source: string; dir: string }
  >
  assert.equal(record.hello?.source, 'plugins/hello')
  assert.equal(existsSync(join(home, record.hello?.dir ?? 'missing')), true)

  // The app folder moves; its data home stays. The plugin starts from its folder at the new place, not from the old path or a stale copy.
  const after = join(home, 'where-it-is')
  renameSync(before, after)
  const second = await boot({ home, root: after, sources: sources(after) })
  const summary = await second.root.extensions.ready
  assert.deepEqual([summary.installed, summary.stale], [['hello'], []])
  assert.equal(second.root.extensions.list()[0]?.source, join(after, 'plugins', 'hello'))
  await second.stop()

  // A record an older version wrote (an absolute source that is gone) still finds the folder of the same name in the sources.
  const written = JSON.parse(readFileSync(join(home, 'extensions.json'), 'utf8')) as Record<
    string,
    { source: string }
  >
  writeFileSync(
    join(home, 'extensions.json'),
    JSON.stringify({ hello: { ...written.hello, source: join(before, 'plugins', 'hello') } }),
  )
  const third = await boot({ home, root: after, sources: sources(after) })
  const old = await third.root.extensions.ready
  assert.deepEqual([old.installed, old.stale], [['hello'], []])
})

test('disposing the plugin disposes every extension it mounted', async () => {
  const { root, folder, stop } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  await stop()
  assert.equal(root.get('greeting'), undefined)
})

test('an extension whose own check fails does not count as installed, and the previous version comes back', async () => {
  const { root, folder } = await boot()
  await root.extensions.install(writeGreeter(folder, 'hello'))
  const dir = join(folder, 'greeter')
  writeFileSync(
    join(dir, 'index.ts'),
    "export const name = 'greeter'\nexport function apply(ctx: any) { ctx.provide('greeting', 'wrong') }\nexport function check(ctx: any) { if (ctx.get('greeting') !== 'right') throw new Error('greeting is not right') }\n",
  )
  const result = await root.extensions.install(dir)
  assert.equal(!result.ok && result.stage, 'verify')
  assert.match(
    !result.ok ? (result.errors[0] ?? '') : '',
    /its check failed: greeting is not right/,
  )
  assert.equal(!result.ok && result.restoredPrevious, true)
  assert.equal(root.get('greeting'), 'hello')
  writeFileSync(
    join(dir, 'index.ts'),
    "export const name = 'greeter'\nexport function apply(ctx: any) { ctx.provide('greeting', 'right') }\nexport function check(ctx: any) { if (ctx.get('greeting') !== 'right') throw new Error('greeting is not right') }\n",
  )
  const passing = await root.extensions.install(dir)
  assert.deepEqual(passing.ok && [passing.action, passing.state], ['updated', 'active'])
})

test('an ask source waits for approval: nothing runs until the owner approves exactly that version', async () => {
  const { root, folder } = await boot({
    sources: (home) => [{ dir: join(home, 'extensions'), trust: 'ask' }],
  })
  const dir = writeGreeter(folder, 'hello')
  const waiting = await root.extensions.install(dir)
  assert.equal(!waiting.ok && waiting.stage, 'approval')
  assert.equal(root.get('greeting'), undefined)
  assert.deepEqual(
    root.extensions.approvals().map((request) => request.name),
    ['greeter'],
  )
  assert.equal((await root.extensions.install(dir)).ok, false)
  assert.equal(root.extensions.ledger().filter((entry) => entry.kind === 'requested').length, 1)

  const installed = await root.extensions.approve('greeter')
  assert.deepEqual(installed.ok && [installed.action, installed.state], ['installed', 'active'])
  assert.equal(root.get('greeting'), 'hello')
  assert.deepEqual(root.extensions.approvals(), [])

  // A new version is a new request; approving after the file changed again is refused.
  writeGreeter(folder, 'bonjour')
  assert.equal(!(await root.extensions.install(dir)).ok, true)
  writeGreeter(folder, 'hola')
  const stale = await root.extensions.approve('greeter')
  assert.match(!stale.ok ? (stale.errors[0] ?? '') : '', /changed after it was requested/)
  assert.equal(root.get('greeting'), 'hello')

  assert.equal((await root.extensions.install(dir)).ok, false)
  assert.equal((await root.extensions.deny('greeter')).ok, true)
  assert.equal((await root.extensions.deny('greeter')).ok, false)
  assert.deepEqual(
    root.extensions.ledger().map((entry) => entry.kind),
    ['requested', 'approved', 'installed', 'requested', 'requested', 'denied'],
  )
})

test('the approval option turns every installing source into one that asks', async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.push(() => rmSync(home, { recursive: true, force: true }))
  const root = new Context()
  const fibers = [
    root.plugin(instance, pinnedInstance(home, { root: appRoot })),
    root.plugin(extensions, {
      approval: true,
      sources: [{ dir: join(home, 'extensions'), trust: 'install' }],
    }),
  ]
  for (const fiber of fibers) await fiber.await()
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  })
  const result = await root.extensions.install(writeGreeter(join(home, 'extensions'), 'hello'))
  assert.equal(!result.ok && result.stage, 'approval')
})

test('an approved extension starts again after a restart without asking', async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  const asking = (dir: string): ExtensionSource[] => [
    { dir: join(dir, 'extensions'), trust: 'ask' },
  ]
  const first = await boot({ home, sources: asking })
  await first.root.extensions.install(writeGreeter(first.folder, 'hello'))
  await first.root.extensions.approve('greeter')
  await first.stop()
  const second = await boot({ home, sources: asking })
  assert.deepEqual((await second.root.extensions.ready).installed, ['greeter'])
  assert.equal(second.root.get('greeting'), 'hello')
  assert.deepEqual(second.root.extensions.approvals(), [])
})

test("a folder listed in library.json is the app's own import, so the source skips it and installs the rest", async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  const plugins = join(home, 'plugins')
  writeGreeter(plugins, 'hello')
  mkdirSync(join(plugins, 'copied'), { recursive: true })
  writeFileSync(
    join(plugins, 'copied', 'index.ts'),
    'export const name = "copied"\nexport function apply() { throw new Error("mounted twice") }\n',
  )
  writeFileSync(join(plugins, 'library.json'), JSON.stringify({ plugins: ['copied'] }))
  const { root } = await boot({ home, sources: () => [{ dir: plugins, trust: 'install' }] })
  const names = root.extensions.list().map((extension) => extension.name)
  assert.deepEqual(names, ['greeter'])
  assert.deepEqual(root.extensions.pending(), [])
})

test("a plugin installed live can import the ports and providers beside it, by name and by the app's #name", () => {
  const aliases = routerAliases()
  for (const name of ['acryl-kv', 'acryl-kv-json', 'acryl-db']) {
    assert.ok(aliases[name] && existsSync(aliases[name]), `${name} resolves to a file`)
    assert.equal(aliases[`#${name}`], aliases[name])
  }
  assert.ok(aliases['#acryl-kv/conformance']?.endsWith('acryl-kv/src/conformance.ts'))
})

test("a plugin installed live from a home outside the app imports the port by its #name and gets the app's own module", async () => {
  const { root, folder } = await boot()
  const dir = join(folder, 'portuser')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.ts'),
    `import { Context } from '@deepseek-ai/cordis'
import { checkKey, KV_SERVICE } from '#acryl-kv'
export const name = 'portuser'
export function apply(ctx: Context) {
  checkKey('ok')
  ctx.provide('portuser', KV_SERVICE)
}
`,
  )
  const result = await root.extensions.install(dir)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.state, 'active')
})

test('a restart after a refused update runs the version that worked, from its staged copy', async () => {
  const home = mkdtempSync(join(tmpdir(), 'extensions-test-'))
  cleanup.unshift(() => rmSync(home, { recursive: true, force: true }))
  const first = await boot({ home })
  await first.root.extensions.install(writeGreeter(first.folder, 'hello'))
  const broken = await first.root.extensions.install(
    writeGreeter(first.folder, 'never', { throws: true }),
  )
  assert.equal(!broken.ok && broken.restoredPrevious, true)
  await first.stop()

  // The broken source is still on disk.
  const second = await boot({ home })
  const summary = await second.root.extensions.ready
  assert.equal(second.root.get('greeting'), 'hello')
  assert.deepEqual(summary.stale, ['greeter'])
  assert.match(summary.failed[0]?.error ?? '', /refuses to start/)
  assert.deepEqual(
    second.root.extensions.list().map((entry) => [entry.name, entry.state, entry.stale]),
    [['greeter', 'active', true]],
  )
})
