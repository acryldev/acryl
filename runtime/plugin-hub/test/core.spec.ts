import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bumpVersion, formatPluginSource, integrityOf, newestVersion, packFolder, parsePluginName, parsePluginSource, pluginNameOf, PluginStore,
  pullPlugin, readTarball, savePlugin, StoreConflictError, writeTarball, type RegistryPort, type ReleasePort,
} from '../src/index.js'

const made: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-hub-'))
  made.push(dir)
  return dir
}
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function folder(files: Record<string, string>): string {
  const dir = temp()
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const manifest = (extra: Record<string, unknown> = {}): string => `${JSON.stringify({ name: '@inboxxobni/notes.sidebar.quick-notes', version: '0.2.1', type: 'module', ...extra }, null, 2)}\n`

describe('plugin names', () => {
  it('reads the dots of a scoped name as the levels of the author\'s tree', () => {
    expect(parsePluginName('@inboxxobni/accounting-app-aurora.sidebar.date-filter')).toEqual({
      full: '@inboxxobni/accounting-app-aurora.sidebar.date-filter', owner: 'inboxxobni', local: 'accounting-app-aurora.sidebar.date-filter',
      path: ['accounting-app-aurora', 'sidebar', 'date-filter'],
    })
    expect(pluginNameOf('inboxxobni', ['accounting-app-aurora', 'sidebar', 'clock-timer']).full).toBe('@inboxxobni/accounting-app-aurora.sidebar.clock-timer')
  })

  it('accepts an older name without a tree, and refuses what npm or DSH\'s installer would refuse', () => {
    expect(parsePluginName('acryl-quick-notes').path).toEqual(['acryl-quick-notes'])
    expect(parsePluginName('snake_case.name').path).toBeUndefined()
    expect(() => parsePluginName('accountingApp.sidebar')).toThrow(/lowercase/)
    expect(() => parsePluginName('@owner/sidebar/sessions-filter')).toThrow(/one "\/" at most/)
    expect(() => pluginNameOf('o', ['side.bar'])).toThrow(/no dot/)
  })
})

describe('versions', () => {
  it('finds the newest by semver precedence and bumps for a fix, a feature or a breaking change', () => {
    expect(newestVersion(['0.2.1', '0.10.0', '0.9.9', '1.0.0-rc.2', '0.2.10', 'nope'])).toBe('1.0.0-rc.2')
    expect(newestVersion(['1.0.0-rc.2', '1.0.0'])).toBe('1.0.0')
    expect(bumpVersion('0.2.1', 'patch')).toBe('0.2.2')
    expect(bumpVersion('0.2.1', 'minor')).toBe('0.3.0')
    expect(bumpVersion('0.2.1', 'major')).toBe('1.0.0')
    expect(bumpVersion('1.0.0-rc.2', 'patch')).toBe('1.0.0')
  })
})

describe('the source argument', () => {
  it('reads every form a face accepts, and writes it back', () => {
    const cases: Record<string, string> = {
      'store:@inboxxobni/notes.sidebar.quick-notes@0.2.1': 'store',
      'github:inboxxobni/acryl-quick-notes': 'github',
      'github:inboxxobni/acryl-quick-notes@v0.2.1': 'github',
      'npm:@scope/name@1.2.3': 'npm',
      '/abs/acryl-quick-notes-0.2.1.tgz': 'tarball-file',
      'https://example.com/x/acryl-quick-notes-0.2.1.tgz': 'tarball-url',
      '/abs/source-folder': 'folder',
      'acryl-quick-notes@0.2.1': 'name',
    }
    for (const [input, kind] of Object.entries(cases)) expect(parsePluginSource(input).kind, input).toBe(kind)
    expect(formatPluginSource(parsePluginSource('github:inboxxobni/acryl-quick-notes@v0.2.1'))).toBe('github:inboxxobni/acryl-quick-notes@0.2.1')
    expect(parsePluginSource('https://github.com/inboxxobni/acryl-quick-notes')).toEqual({ kind: 'github', owner: 'inboxxobni', repo: 'acryl-quick-notes' })
    expect(parsePluginSource('https://github.com/inboxxobni/acryl-quick-notes/releases/tag/v0.2.1')).toEqual({ kind: 'github', owner: 'inboxxobni', repo: 'acryl-quick-notes', version: '0.2.1' })
  })

  it('refuses a raw git address, a branch, plain http and a relative path, saying what to use instead', () => {
    expect(() => parsePluginSource('git+https://github.com/o/r.git')).toThrow(/released version/)
    expect(() => parsePluginSource('git@github.com:o/r.git')).toThrow(/released version/)
    expect(() => parsePluginSource('github:o/r#main')).toThrow(/not a release/)
    expect(() => parsePluginSource('http://example.com/x.tgz')).toThrow(/only https/)
    expect(() => parsePluginSource('./plugin')).toThrow(/absolute/)
    expect(() => parsePluginSource('name@latest')).toThrow(/exact version/)
  })
})

describe('tarballs', () => {
  it('round-trips files, long paths and the executable bit, and is the same bytes every time', () => {
    const long = `${'deep/'.repeat(30)}file.js`
    const files = [{ path: 'package.json', content: Buffer.from('{}') }, { path: long, content: Buffer.from('x'.repeat(1500)) }, { path: 'bin/run', content: Buffer.from('#!/bin/sh\n'), executable: true }]
    const first = writeTarball(files)
    expect(writeTarball([...files].reverse()).equals(first)).toBe(true)
    expect(first[9]).toBe(3)
    const read = readTarball(first)
    expect(read.map(file => file.path)).toEqual(['bin/run', long, 'package.json'])
    expect(read.find(file => file.path === 'bin/run')?.executable).toBe(true)
    expect(Buffer.from(read.find(file => file.path === long)!.content).toString()).toBe('x'.repeat(1500))
  })

  it('refuses an entry that would leave the package', () => {
    const evil = Buffer.from(gunzipSync(writeTarball([{ path: 'aaaaaaaa', content: Buffer.from('x') }])))
    evil.write('package/../../etc/passwd'.padEnd(100, '\0'), 0, 'utf8')
    let sum = 0
    evil.fill(0x20, 148, 156)
    for (let index = 0; index < 512; index += 1) sum += evil[index]!
    evil.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'utf8')
    expect(() => readTarball(gzipSync(evil))).toThrow(/leaves the package/)
  })
})

describe('packing a source folder', () => {
  it('packs the "files" list plus package.json, README and LICENSE, never node_modules or dotfiles', () => {
    const dir = folder({
      'package.json': manifest({ files: ['index.js', 'lib'] }), 'index.js': 'export {}', 'lib/a.js': '', 'README.md': '#', 'LICENSE': 'MIT',
      'notes.txt': 'not listed', 'node_modules/x/index.js': '', 'lib/.DS_Store': '',
    })
    const packed = packFolder(dir)
    expect(packed.files).toEqual(['LICENSE', 'README.md', 'index.js', 'lib/a.js', 'package.json'])
    expect(packed.fileName).toBe('inboxxobni-notes.sidebar.quick-notes-0.2.1.tgz')
    expect(packed.integrity).toBe(integrityOf(packed.tarball))
    expect(packFolder(dir).integrity).toBe(packed.integrity)
  })

  it('without a "files" list packs everything not ignored by .npmignore', () => {
    const dir = folder({ 'package.json': manifest(), 'index.js': '', 'dist/out.js': '', 'test/a.spec.js': '', '.npmignore': 'test/\n*.log\n', 'debug.log': '', '.git/HEAD': '' })
    expect(packFolder(dir).files).toEqual(['dist/out.js', 'index.js', 'package.json'])
  })

  it('refuses a folder with no name or no semantic version', () => {
    expect(() => packFolder(folder({ 'package.json': '{"name":"x"}' }))).toThrow(/semantic "version"/)
    expect(() => packFolder(folder({ 'index.js': '' }))).toThrow(/package.json is missing/)
  })

  it('marks a file executable from its content and bin, never from the file mode, so every system packs the same bytes', () => {
    const dir = folder({ 'package.json': manifest({ bin: { demo: './cli/demo.js' } }), 'bin/run': '#!/bin/sh\n', 'cli/demo.js': 'console.log(1)\n', 'plain.js': 'export {}\n', 'mode-only.js': 'export {}\n' })
    chmodSync(join(dir, 'mode-only.js'), 0o755)
    const packed = readTarball(packFolder(dir).tarball)
    const executable = Object.fromEntries(packed.map(file => [file.path, file.executable]))
    expect(executable).toMatchObject({ 'bin/run': true, 'cli/demo.js': true, 'plain.js': false, 'mode-only.js': false })
    chmodSync(join(dir, 'mode-only.js'), 0o644)
    chmodSync(join(dir, 'bin/run'), 0o644)
    expect(packFolder(dir).integrity).toBe(integrityOf(writeTarball(packed)))
  })

  const npmAvailable = (() => { try { execFileSync('npm', ['--version'], { stdio: 'ignore' }); return true } catch { return false } })()
  const quickNotes = fileURLToPath(new URL('../../../.acryl-extensions/acryl-quick-notes/', import.meta.url))
  it.skipIf(!npmAvailable || !existsSync(join(quickNotes, 'package.json')))('packs the same files as npm pack (quick-notes)', () => {
    const out = temp()
    const json = execFileSync('npm', ['pack', '--json', '--dry-run', '--ignore-scripts', quickNotes], { cwd: out, encoding: 'utf8' })
    const npmFiles = (JSON.parse(json) as { files: { path: string }[] }[])[0]!.files.map(file => file.path).sort()
    expect(packFolder(quickNotes).files).toEqual(npmFiles)
  })
  // On Windows `corepack` is a .cmd file, which Node runs only through a shell.
  const shell = process.platform === 'win32'
  const pnpmAvailable = (() => { try { execFileSync('corepack', ['pnpm', '--version'], { stdio: 'ignore', shell }); return true } catch { return false } })()
  it.skipIf(!pnpmAvailable)('a packed tarball installs with pnpm, which records the same sha512 (the path DSH\'s installer takes)', () => {
    const dir = folder({ 'package.json': `${JSON.stringify({ name: '@proof/hub.sidebar.demo', version: '1.0.0', main: 'index.js' })}\n`, 'index.js': "module.exports = 'packed by plugin-hub'\n" })
    const packed = packFolder(dir)
    const app = folder({ 'package.json': '{"name":"app","version":"0.0.0","private":true}\n' })
    const tarball = join(app, packed.fileName)
    writeFileSync(tarball, packed.tarball)
    execFileSync('corepack', ['pnpm', 'add', `file:${tarball}`, '--offline', '--ignore-scripts'], { cwd: app, stdio: 'ignore', shell })
    expect(execFileSync(process.execPath, ['-e', "process.stdout.write(require('@proof/hub.sidebar.demo'))"], { cwd: app, encoding: 'utf8' })).toBe('packed by plugin-hub')
    expect(readFileSync(join(app, 'pnpm-lock.yaml'), 'utf8')).toContain(packed.integrity)
  }, 120_000)
})

describe('the store', () => {
  it('keeps a version once: the same bytes again are a no-op, different bytes are refused', () => {
    const store = new PluginStore(temp())
    const dir = folder({ 'package.json': manifest({ acryl: { requires: { host: ['connection'] }, provides: { host: [] } } }), 'index.js': 'export {}' })
    const first = savePlugin(dir, store)
    expect(first.added).toBe(true)
    expect(first.stored.requires).toEqual({ host: ['connection'] })
    expect(savePlugin(dir, store).added).toBe(false)
    writeFileSync(join(dir, 'index.js'), 'export const changed = 1')
    expect(() => savePlugin(dir, store)).toThrow(StoreConflictError)
    writeFileSync(join(dir, 'package.json'), manifest({ version: '0.2.2' }))
    expect(savePlugin(dir, store).stored.version).toBe('0.2.2')
    expect(store.list().map(entry => entry.version)).toEqual(['0.2.2', '0.2.1'])
    expect(store.get('@inboxxobni/notes.sidebar.quick-notes')?.version).toBe('0.2.2')
    expect(existsSync(store.tarballPath('@inboxxobni/notes.sidebar.quick-notes', '0.2.1'))).toBe(true)
  })

  it('reports a stored file that was changed on disk instead of handing it out', () => {
    const store = new PluginStore(temp())
    const saved = savePlugin(folder({ 'package.json': manifest() }), store)
    writeFileSync(saved.stored.path, 'tampered')
    expect(() => store.get(saved.stored.name, saved.stored.version)).toThrow(/no longer matches its checksum/)
  })
})

describe('pulling', () => {
  function release(version = '0.2.1', name = '@inboxxobni/notes.sidebar.quick-notes'): Buffer {
    return packFolder(folder({ 'package.json': `${JSON.stringify({ name, version })}\n`, 'index.js': 'export {}' })).tarball
  }
  function releases(tags: Record<string, { name: string; bytes: Buffer }[]>, latest?: string): ReleasePort & { downloads: string[] } {
    const downloads: string[] = []
    return {
      downloads,
      async release(_owner, _repo, tag) {
        const chosen = tag ?? latest
        const assets = chosen === undefined ? undefined : tags[chosen]
        return assets === undefined || chosen === undefined ? undefined : { tag: chosen, assets: assets.map(asset => ({ name: asset.name, url: `https://dl/${chosen}/${asset.name}` })) }
      },
      async download(url) {
        downloads.push(url)
        for (const assets of Object.values(tags)) for (const asset of assets) if (url.endsWith(`/${asset.name}`)) return asset.bytes
        throw new Error(`no ${url}`)
      },
    }
  }

  it('pulls the latest GitHub release or a pinned one into the store, then from the store offline', async () => {
    const store = new PluginStore(temp())
    const port = releases({ 'v0.2.1': [{ name: 'q-0.2.1.tgz', bytes: release('0.2.1') }], 'v0.2.2': [{ name: 'q-0.2.2.tgz', bytes: release('0.2.2') }] }, 'v0.2.2')
    const latest = await pullPlugin(parsePluginSource('github:inboxxobni/acryl-quick-notes'), { store, releases: port })
    expect(latest.stored.version).toBe('0.2.2')
    expect(latest.stored.from).toBe('github:inboxxobni/acryl-quick-notes')
    const pinned = await pullPlugin(parsePluginSource('github:inboxxobni/acryl-quick-notes@0.2.1'), { store, releases: port })
    expect(pinned.stored.version).toBe('0.2.1')
    const offline = await pullPlugin(parsePluginSource('store:@inboxxobni/notes.sidebar.quick-notes@0.2.1'), { store })
    expect(offline.added).toBe(false)
    expect(offline.stored.integrity).toBe(pinned.stored.integrity)
    expect(port.downloads).toHaveLength(2)
  })

  it('refuses, leaving the store as it was: no release, several tarballs, a tag that disagrees with the package, a wrong checksum', async () => {
    const store = new PluginStore(temp())
    const pull = (source: string, port: ReleasePort, expectIntegrity?: string) => pullPlugin(parsePluginSource(source), { store, releases: port }, expectIntegrity === undefined ? {} : { expectIntegrity })
    await expect(pull('github:o/r', releases({}))).rejects.toThrow(/has no release that this app can see; ask its author/)
    await expect(pull('github:o/r@1.0.0', releases({ 'v1.0.0': [{ name: 'a.tgz', bytes: release('1.0.0') }, { name: 'b.tgz', bytes: release('1.0.0') }] }))).rejects.toThrow(/2 \.tgz files/)
    await expect(pull('github:o/r@1.0.0', releases({ 'v1.0.0': [{ name: 'a.tgz', bytes: release('0.9.0') }] }))).rejects.toThrow(/release is v1.0.0 but the tarball inside is 0.9.0/)
    await expect(pull('github:o/r@1.0.0', releases({ 'v1.0.0': [{ name: 'a.tgz', bytes: release('1.0.0') }] }), 'sha512-AAAA')).rejects.toThrow(/nothing was installed/)
    await expect(pull('github:o/r@1.0.0', releases({ 'v1.0.0': [{ name: 'a.tgz', bytes: Buffer.from('not a tarball') }] }))).rejects.toThrow()
    expect(store.list()).toEqual([])
  })

  it('checks npm\'s own integrity, and a bare name tries the store before npm', async () => {
    const store = new PluginStore(temp())
    const bytes = release('1.2.3', '@scope/name')
    const registry = (integrity: string): RegistryPort => ({ resolve: async () => ({ version: '1.2.3', tarball: 'https://registry/x.tgz', integrity }), download: async () => bytes })
    await expect(pullPlugin(parsePluginSource('npm:@scope/name'), { store, registry: registry('sha512-wrong') })).rejects.toThrow(/checksum/)
    const pulled = await pullPlugin(parsePluginSource('npm:@scope/name'), { store, registry: registry(integrityOf(bytes)) })
    expect(pulled.added).toBe(true)
    const fromStore = await pullPlugin(parsePluginSource('@scope/name'), { store })
    expect(fromStore.added).toBe(false)
  })

  it('a tarball file pulls the same bytes as its release, and a folder is not a pull', async () => {
    const store = new PluginStore(temp())
    const file = join(temp(), 'q-0.2.1.tgz')
    writeFileSync(file, release('0.2.1'))
    const pulled = await pullPlugin(parsePluginSource(file), { store })
    expect(pulled.stored.integrity).toBe(integrityOf(readFileSync(file)))
    await expect(pullPlugin(parsePluginSource('/some/folder'), { store })).rejects.toThrow(/plugin you edit/)
  })
})
