import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import { createPluginHub, findSourceFolder, missingHostServices, packFolder, PluginStore } from '@webboxes/plugin-hub'
import { apply, runPluginCommand, sourceRoots, storeRoot } from '../index.js'

const made = []
function temp() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-plugin-hub-')))
  made.push(dir)
  return dir
}
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function pluginFolder(root, folderName, pkg) {
  const dir = join(root, folderName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  writeFileSync(join(dir, 'index.js'), 'export function apply() {}\n')
  return dir
}

const notes = (version = '0.2.1', requires = { host: ['connection', 'dshHomePath', 'webServer'], client: ['connection', 'slots'] }) =>
  ({ name: '@inboxxobni/notes.sidebar.quick-notes', version, type: 'module', acryl: { schemaVersion: 1, requires, provides: { host: [], client: [] } } })

function releasePort(tarballs) {
  return {
    async release(_owner, _repo, tag) {
      const chosen = tag ?? Object.keys(tarballs).at(-1)
      return tarballs[chosen] === undefined ? undefined : { tag: chosen, assets: [{ name: `${chosen}.tgz`, url: `https://dl/${chosen}.tgz` }] }
    },
    async download(url) { return tarballs[url.replace('https://dl/', '').replace('.tgz', '')] },
  }
}

function hubWith({ services = ['connection', 'dshHomePath', 'webServer'], installer, tarballs = {} } = {}) {
  const store = new PluginStore(join(temp(), 'store'))
  const installs = []
  const manager = installer !== undefined ? installer : {
    async installBundle(path) { installs.push(path); return { changed: true, application: 'applied', stage: 'enable', target: path } },
    async listBundles() { return [{ name: '@inboxxobni/notes.sidebar.quick-notes', version: '0.2.1', enabled: true, installed: true, removable: true }, { name: 'shipped-bundle', installed: false, enabled: true }] },
  }
  const hub = createPluginHub({ store, releases: releasePort(tarballs), has: name => services.includes(name), installer: () => manager === null ? undefined : manager })
  return { hub, store, installs }
}

test('the plugin provides pluginHub from the app instance home and registers /plugin only while commands exist', () => {
  const home = temp()
  const provided = {}; const registered = []
  const ctx = {
    appInstance: { home },
    get: () => undefined,
    provide: (key, value) => { provided[key] = value },
    inject: (deps, run) => {
      assert.deepEqual(deps, ['commands'])
      const effects = []
      run({ effect: fn => effects.push(fn), commands: { register: command => { registered.push(command.name); return () => registered.splice(registered.indexOf(command.name), 1) } } })
      const dispose = effects[0]()
      assert.deepEqual(registered, ['plugin'])
      dispose()
      assert.deepEqual(registered, [])
    },
  }
  apply(ctx)
  assert.equal(provided.pluginHub.store.root, storeRoot({ home }))
  assert.equal(storeRoot({ home }), join(home, 'plugins', 'store'))
})

test('the service contract is checked against what this app provides; a plugin without one is not refused', () => {
  assert.deepEqual(missingHostServices(notes(), name => name !== 'webServer'), { checked: true, missing: ['webServer'] })
  assert.deepEqual(missingHostServices({ name: 'stock-dsh-plugin' }, () => false), { checked: false, missing: [] })
})

test('pull: a GitHub release is checked, kept, then installed through the plugin manager with the stored file', async () => {
  const src = temp()
  const v021 = packFolder(pluginFolder(src, 'a', notes('0.2.1'))).tarball
  const { hub, installs } = hubWith({ tarballs: { 'v0.2.1': v021 } })
  const result = await hub.pull('github:inboxxobni/acryl-quick-notes@0.2.1')
  assert.equal(result.status, 'installed')
  assert.equal(result.version, '0.2.1')
  assert.deepEqual(installs, [result.path])
  assert.equal(readFileSync(result.path).equals(v021), true)
  const text = (await runPluginCommand('pull github:inboxxobni/acryl-quick-notes@0.2.1', hub, {})).text
  assert.match(text, /^Installed @inboxxobni\/notes\.sidebar\.quick-notes 0\.2\.1 \(sha512-/u)
})

test('pull: a plugin needing a service this app lacks is kept but not installed, and the services are named', async () => {
  const src = temp()
  const tarball = packFolder(pluginFolder(src, 'a', notes('0.2.1', { host: ['connection', 'trackMixer'] }))).tarball
  const { hub, installs } = hubWith({ tarballs: { 'v0.2.1': tarball } })
  const result = await runPluginCommand('pull github:o/r', hub, {})
  assert.equal(result.kind, 'error')
  assert.match(result.text, /needs trackMixer, which this app does not provide/u)
  assert.deepEqual(installs, [])
  assert.equal(hub.saved().length, 1)
})

test('pull: without DSH\'s plugin manager the plugin is only kept, and the reason is given', async () => {
  const src = temp()
  const { hub } = hubWith({ installer: null, tarballs: { 'v0.2.1': packFolder(pluginFolder(src, 'a', notes())).tarball } })
  const result = await runPluginCommand('pull github:o/r', hub, {})
  assert.equal(result.kind, 'success')
  assert.match(result.text, /^Kept .* not installed: this app has no plugin installer/u)
})

test('pull: a failed install reports the installer\'s own reason', async () => {
  const src = temp()
  const installer = { async installBundle() { return { changed: false, application: 'failed', stage: 'install', target: 'x', error: { code: 'incompatible-version' }, packageResult: { output: 'peer @deepseek-ai/dsh@^9 not satisfied' } } } }
  const { hub } = hubWith({ installer, tarballs: { 'v0.2.1': packFolder(pluginFolder(src, 'a', notes())).tarball } })
  const result = await runPluginCommand('pull github:o/r', hub, {})
  assert.equal(result.kind, 'error')
  assert.match(result.text, /incompatible-version/u)
  assert.match(result.text, /peer @deepseek-ai\/dsh@\^9/u)
})

test('/plugin save, version and saved: a source folder found by name, a fix as a new version, every version listed', async () => {
  const workspace = temp()
  const folder = pluginFolder(join(workspace, '.acryl-extensions'), 'quick-notes', notes('0.2.1'))
  const { hub } = hubWith()
  assert.equal(findSourceFolder('@inboxxobni/notes.sidebar.quick-notes', sourceRoots({ workspaceDir: workspace })), folder)
  assert.equal(findSourceFolder('quick-notes', sourceRoots({ workspaceDir: workspace })), folder)
  assert.match((await runPluginCommand('save quick-notes', hub, { workspaceDir: workspace })).text, /^Saved @inboxxobni\/notes\.sidebar\.quick-notes 0\.2\.1 \(2 files\)/u)
  assert.match((await runPluginCommand('save quick-notes', hub, { workspaceDir: workspace })).text, /already saved with exactly these files/u)
  writeFileSync(join(folder, 'index.js'), 'export function apply() { /* fixed */ }\n')
  assert.match((await runPluginCommand('save quick-notes', hub, { workspaceDir: workspace })).text, /already in the store with different content.*new version/u)
  assert.match((await runPluginCommand('version patch quick-notes', hub, { workspaceDir: workspace })).text, /0\.2\.1 -> 0\.2\.2/u)
  assert.equal(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version, '0.2.2')
  await runPluginCommand('save quick-notes', hub, { workspaceDir: workspace })
  const saved = (await runPluginCommand('saved', hub, {})).text.split('\n')
  assert.deepEqual(saved.map(line => line.split('  ')[0]), ['@inboxxobni/notes.sidebar.quick-notes 0.2.2', '@inboxxobni/notes.sidebar.quick-notes 0.2.1'])
  const list = (await runPluginCommand('list', hub, {})).text
  assert.match(list, /Installed:\n {2}@inboxxobni\/notes\.sidebar\.quick-notes 0\.2\.1\n/u)
  assert.doesNotMatch(list, /shipped-bundle/u)
})

test('/plugin refuses what it cannot do, with the usage or the reason', async () => {
  const { hub } = hubWith()
  assert.match((await runPluginCommand('', hub, {})).text, /^Usage: \/plugin/u)
  assert.match((await runPluginCommand('version huge x', hub, {})).text, /^Usage/u)
  assert.match((await runPluginCommand('save nothing-here', hub, { workspaceDir: temp() })).text, /No plugin folder named "nothing-here"/u)
  assert.match((await runPluginCommand('pull git+https://github.com/o/r.git', hub, {})).text, /released version/u)
})
