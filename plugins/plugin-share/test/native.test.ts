import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  ensureNative,
  type NativePackage,
  type NativePorts,
  nativeFor,
  nativePorts,
  nativeStore,
  nativesOf,
  PLACEHOLDER,
  releaseNative,
  tarballUrl,
} from '../native.ts'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})
const scratch = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const INTEGRITY = `sha512-${'A'.repeat(86)}==`
const entry = (fields: Record<string, unknown> = {}) => ({
  package: '@scope/engine-darwin-arm64',
  version: '1.2.3',
  os: 'darwin',
  cpu: 'arm64',
  integrity: INTEGRITY,
  size: 1000,
  ...fields,
})

test('a plugin without the field brings nothing; a valid list is read as it is', () => {
  assert.deepEqual(nativesOf({ name: 'x' }), { natives: [] })
  assert.deepEqual(nativesOf({ acrylblends: {} }), { natives: [] })
  // The second entry has no CPU: a build for any CPU of that OS (a WebAssembly engine), read without the key.
  const { cpu: _anyCpu, ...wasm } = entry({ os: 'linux' })
  assert.deepEqual(nativesOf({ acrylblends: { native: [entry(), wasm] } }), {
    natives: [entry(), wasm],
  })
})

test('a declaration that cannot be trusted is refused with the field that is wrong', () => {
  const error = (native: unknown) => {
    const read = nativesOf({ acrylblends: { native } })
    return 'error' in read ? read.error : ''
  }
  assert.match(error({}), /not a list/u)
  assert.match(error([entry({ package: '../../etc' })]), /\.package/u)
  assert.match(error([entry({ version: '^1.2.3' })]), /exact version/u)
  assert.match(error([entry({ os: 'aix' })]), /\.os/u)
  assert.match(error([entry({ cpu: 'ia32' })]), /\.cpu/u)
  assert.match(error([entry({ integrity: 'sha1-abc' })]), /sha512/u)
  assert.match(error([entry({ size: -1 })]), /\.size/u)
  assert.match(error([entry({ size: 2_000_000_000 })]), /more than a plugin may bring/u)
})

test("this computer's entry: its OS and CPU first, then its OS for any CPU", () => {
  const natives = [
    entry(),
    { ...entry({ package: '@scope/engine-wasm' }), os: 'linux' as const, cpu: undefined },
    entry({ package: '@scope/engine-win32-x64', os: 'win32', cpu: 'x64' }),
  ] as NativePackage[]
  assert.equal(nativeFor(natives, 'darwin', 'arm64')?.package, '@scope/engine-darwin-arm64')
  assert.equal(nativeFor(natives, 'linux', 'arm64')?.package, '@scope/engine-wasm')
  assert.equal(nativeFor(natives, 'win32', 'x64')?.package, '@scope/engine-win32-x64')
  assert.equal(nativeFor(natives, 'darwin', 'x64'), undefined)
})

test("the tarball's address is npm's", () => {
  assert.equal(
    tarballUrl({ package: '@deepseek-ai/libreoffice-kit-darwin-arm64', version: '0.1.5' }),
    'https://registry.npmjs.org/@deepseek-ai/libreoffice-kit-darwin-arm64/-/libreoffice-kit-darwin-arm64-0.1.5.tgz',
  )
})

/** A native package as npm packs it (`package/` at the top), with an executable, and the entry that names it. */
function engine(name = '@scope/engine-darwin-arm64', version = '1.2.3') {
  const dir = scratch('native-pack-')
  mkdirSync(join(dir, 'package', 'bin'), { recursive: true })
  writeFileSync(join(dir, 'package', 'package.json'), JSON.stringify({ name, version }))
  writeFileSync(join(dir, 'package', 'bin', 'engine'), '#!/bin/sh\necho engine\n', { mode: 0o755 })
  const file = join(dir, 'engine.tgz')
  execFileSync('tar', ['-czf', file, '-C', dir, 'package'])
  const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
  const native: NativePackage = {
    package: name,
    version,
    os: 'darwin',
    cpu: 'arm64',
    integrity,
    size: 100,
  }
  const downloads: string[] = []
  const ports: NativePorts = {
    download: async (url, to) => {
      downloads.push(url)
      copyFileSync(file, to)
    },
    unpack: nativePorts().unpack,
  }
  return { native, ports, downloads }
}

const app = () => ({ root: scratch('native-root-'), home: scratch('native-home-') })
const linkIn = (root: string) => join(root, 'node_modules', '@scope', 'engine-darwin-arm64')

test('installs from npm: checked, unpacked with its execute bits into the home, linked where the package resolves it', async () => {
  const { native, ports, downloads } = engine()
  const places = app()
  assert.equal(await ensureNative(native, places, ports), 'downloaded')
  assert.deepEqual(downloads, [tarballUrl(native)])
  const link = linkIn(places.root)
  assert.ok(lstatSync(link).isSymbolicLink())
  assert.equal(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')).name, native.package)
  if (process.platform !== 'win32') assert.ok(statSync(join(link, 'bin', 'engine')).mode & 0o100)
  assert.ok(existsSync(nativeStore(places.home, native)))
  assert.equal(await ensureNative(native, places, ports), 'unchanged')
  assert.equal(downloads.length, 1)
})

test('an npm install that put the placeholder back is linked again from the home, without a second download', async () => {
  const { native, ports, downloads } = engine()
  const places = app()
  await ensureNative(native, places, ports)
  const link = linkIn(places.root)
  rmSync(link, { recursive: true, force: true })
  mkdirSync(link, { recursive: true })
  writeFileSync(join(link, 'package.json'), JSON.stringify({ name: PLACEHOLDER, version: '1.0.0' }))
  assert.equal(await ensureNative(native, places, ports), 'linked')
  assert.equal(downloads.length, 1)
  assert.ok(lstatSync(link).isSymbolicLink())
})

test('a real copy npm installed is left alone, and so is its removal', async () => {
  const { native, ports, downloads } = engine()
  const places = app()
  const link = linkIn(places.root)
  mkdirSync(link, { recursive: true })
  writeFileSync(
    join(link, 'package.json'),
    JSON.stringify({ name: native.package, version: '1.2.3' }),
  )
  assert.equal(await ensureNative(native, places, ports), 'present')
  assert.deepEqual(downloads, [])
  releaseNative(native, places)
  assert.ok(existsSync(join(link, 'package.json')))
})

test('a download that is not the file the plugin names is refused and leaves nothing behind', async () => {
  const { native, ports } = engine()
  const places = app()
  await assert.rejects(
    ensureNative({ ...native, integrity: INTEGRITY }, places, ports),
    /sha512 differs/u,
  )
  assert.equal(existsSync(linkIn(places.root)), false)
  assert.deepEqual(readdirSync(join(places.home, 'native')), [])
})

test('a tarball holding another package is refused', async () => {
  const { native, ports } = engine('@scope/other', '1.2.3')
  const places = app()
  await assert.rejects(
    ensureNative({ ...native, package: '@scope/engine-darwin-arm64' }, places, ports),
    /holds @scope\/other@1\.2\.3/u,
  )
})

test('removal takes the link and the download; keeping the download keeps only that', async () => {
  const { native, ports } = engine()
  const places = app()
  await ensureNative(native, places, ports)
  releaseNative(native, places, true)
  assert.equal(existsSync(linkIn(places.root)), false)
  assert.ok(existsSync(nativeStore(places.home, native)))
  await ensureNative(native, places, ports)
  releaseNative(native, places)
  assert.equal(existsSync(linkIn(places.root)), false)
  assert.equal(existsSync(nativeStore(places.home, native)), false)
})

test('an update of the native package replaces the link to the older download', async () => {
  const older = engine('@scope/engine-darwin-arm64', '1.2.3')
  const newer = engine('@scope/engine-darwin-arm64', '1.3.0')
  const places = app()
  await ensureNative(older.native, places, older.ports)
  assert.equal(await ensureNative(newer.native, places, newer.ports), 'downloaded')
  assert.equal(
    JSON.parse(readFileSync(join(linkIn(places.root), 'package.json'), 'utf8')).version,
    '1.3.0',
  )
})
