import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import {
  acquireWebRuntime,
  confirmWebAcquisition,
  selectWebArtifact,
  webRuntimeCommand,
} from '../web-runtime.js'

const target = 'darwin-arm64'
const version = '0.1.19'
const contents = Buffer.from('verified archive')
const sha256 = createHash('sha256').update(contents).digest('hex')
const artifact = {
  surface: 'web', target, location: 'https://example.test/web.tgz', integrity: { algorithm: 'sha256', value: sha256 },
  receipt: { schemaVersion: 1, surface: 'web', target, version, capabilityBaseline: 'acryl-capability-baseline-v1', location: 'https://example.test/web.tgz', integrity: { algorithm: 'sha256', value: sha256 } },
}
const manifest = { schemaVersion: 1, version, capabilityBaseline: 'acryl-capability-baseline-v1', artifacts: [artifact] }

const stores = []
afterEach(() => { for (const dir of stores.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function store() { const dir = mkdtempSync(join(tmpdir(), 'acryl-web-runtime-test-')); stores.push(dir); return dir }

async function extractor(archive, runtimeRoot) {
    assert.deepEqual(readFileSync(archive), contents)
    mkdirSync(join(runtimeRoot, 'runtime', 'bin'), { recursive: true })
    writeFileSync(join(runtimeRoot, 'ready'), 'ready')
    // The launcher the real archive has on this machine's platform, which the readiness check looks for.
    writeFileSync(join(runtimeRoot, 'runtime', 'bin', process.platform === 'win32' ? 'acryl-web.cmd' : 'acryl-web'), 'ready')
}

test('requires explicit confirmation unless --yes was supplied', () => {
  assert.equal(confirmWebAcquisition({ yes: true, interactive: false }), true)
  assert.equal(confirmWebAcquisition({ yes: false, interactive: false }), false)
  assert.equal(confirmWebAcquisition({ yes: false, interactive: true, confirm: () => true }), true)
})

test('rejects malformed and mismatched release manifests precisely', () => {
  assert.throws(() => selectWebArtifact({}, { version, target }), /manifest is malformed/)
  assert.throws(() => selectWebArtifact({ ...manifest, version: '9.9.9' }, { version, target }), /version 9\.9\.9 does not match installed CLI version/)
  assert.throws(() => selectWebArtifact({ schemaVersion: 1, version, artifacts: [] }, { version, target }), /does not contain a Web artifact/)
  assert.throws(() => selectWebArtifact({ ...manifest, artifacts: [{ ...artifact, target: 'linux-x64' }] }, { version, target }), /does not contain a Web artifact/)
  assert.equal(selectWebArtifact({ ...manifest, artifactBaseUrl: 'https://example.test/releases/v0.1.19/release-manifest.json', artifacts: [{ ...artifact, location: 'acryl-web-darwin-arm64.tar.gz', receipt: { ...artifact.receipt, location: 'acryl-web-darwin-arm64.tar.gz' } }] }, { version, target }).url, 'https://example.test/releases/v0.1.19/acryl-web-darwin-arm64.tar.gz')
})

test('rejects a checksum failure without writing a managed runtime', async () => {
  const root = store()
  await assert.rejects(acquireWebRuntime({ root, version, target, manifest, download: async () => Buffer.from('tampered'), extract: extractor }), /checksum verification failed/)
  assert.equal(existsSync(join(root, version, target)), false)
})

test('interrupted download preserves an earlier verified cache', async () => {
  const root = store()
  const cached = join(root, version, target)
  await acquireWebRuntime({ root, version, target, manifest, download: async () => contents, extract: extractor })
  await assert.rejects(acquireWebRuntime({ root, version: '0.1.20', target, manifest: { ...manifest, version: '0.1.20', artifacts: [{ ...artifact, receipt: { ...artifact.receipt, version: '0.1.20' } }] }, download: async () => { throw new Error('interrupted') }, extract: extractor }), /interrupted/)
  assert.equal(readFileSync(join(cached, 'ready'), 'utf8'), 'ready')
})

test('installs by atomic replacement only after extraction is ready', async () => {
  const root = store()
  await acquireWebRuntime({ root, version, target, manifest, download: async () => contents, extract: extractor })
  assert.equal(readFileSync(join(root, version, target, 'ready'), 'utf8'), 'ready')
})

test('atomically replaces an invalid managed runtime only after a ready extraction', async () => {
  const root = store()
  const invalid = join(root, version, target)
  mkdirSync(invalid, { recursive: true })
  writeFileSync(join(invalid, 'partial'), 'never launch this')
  await acquireWebRuntime({ root, version, target, manifest, download: async () => contents, extract: extractor })
  assert.equal(readFileSync(join(invalid, 'ready'), 'utf8'), 'ready')
  assert.equal(existsSync(join(invalid, 'partial')), false)
})

test('reuses a verified cache without downloading again', async () => {
  const root = store()
  await acquireWebRuntime({ root, version, target, manifest, download: async () => contents, extract: extractor })
  const result = await acquireWebRuntime({ root, version, target, manifest, download: async () => { throw new Error('should not download') }, extract: extractor })
  assert.equal(result.reused, true)
})

test('requires extracted runtime readiness before committing cache', async () => {
  const root = store()
  await assert.rejects(acquireWebRuntime({ root, version, target, manifest, download: async () => contents, extract: async () => {} }), /readiness check failed/)
  assert.equal(existsSync(join(root, version, target)), false)
})

test('starts the Web runtime through its launcher, and on Windows runs what the .cmd launcher runs, without cmd.exe', () => {
  assert.deepEqual(webRuntimeCommand('/w', ['--port', '3000'], { platform: 'darwin' }), { command: join('/w', 'runtime', 'bin', 'acryl-web'), args: ['--port', '3000'] })
  assert.deepEqual(webRuntimeCommand('/w', ['--port', '3000'], { platform: 'win32' }), { command: join('/w', 'runtime', 'bin', 'node.exe'), args: [join('/w', 'lib', 'bin.js'), '--port', '3000'] })
  // The .cmd the Web archive ships (scripts/build-web-archive.mjs) must keep running the same thing.
  const builder = readFileSync(new URL('../../../scripts/build-web-archive.mjs', import.meta.url), 'utf8')
  assert.ok(builder.includes(String.raw`'@echo off\r\n"%~dp0node.exe" "%~dp0..\\..\\lib\\bin.js" %*\r\n'`))
})
