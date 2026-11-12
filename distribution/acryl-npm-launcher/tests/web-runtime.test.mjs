import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASE_MANIFEST_NAME } from '../release-contract.js'
import {
  acquireWebRuntime,
  confirmWebAcquisition,
  fetchReleaseManifest,
  manifestUrl,
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

test('looks for the release manifest under the name the release uploads it with', () => {
  const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.github', 'workflows', 'release-cli.yml'), 'utf8')
  assert.match(workflow, new RegExp(`path: artifacts/${RELEASE_MANIFEST_NAME.replaceAll('.', '\\.')}\\n`, 'u'))
  assert.equal(manifestUrl('1.2.3', {}), `https://github.com/acryldev/acryl/releases/download/v1.2.3/${RELEASE_MANIFEST_NAME}`)
})

// GitHub answers every release download with a redirect to its asset host, so a Web runtime is only reachable through one.
test('fetches the manifest and the Web archive through the redirects a release download answers with', async () => {
  const served = { ...manifest, artifacts: [{ ...artifact, location: 'web.tgz', receipt: { ...artifact.receipt, location: 'web.tgz' } }] }
  const server = createServer((request, response) => {
    if (request.url === `/download/v${version}/${RELEASE_MANIFEST_NAME}`) response.writeHead(302, { location: '/assets/manifest' }).end()
    else if (request.url === `/download/v${version}/web.tgz`) response.writeHead(302, { location: '/assets/web' }).end()
    else if (request.url === '/assets/manifest') response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(served))
    else if (request.url === '/assets/web') response.writeHead(200).end(contents)
    else response.writeHead(404).end()
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  try {
    const url = manifestUrl(version, { ACRYL_RELEASE_MANIFEST_URL: `http://127.0.0.1:${String(server.address().port)}/download/v${version}/${RELEASE_MANIFEST_NAME}` })
    const fetched = await fetchReleaseManifest(url)
    const result = await acquireWebRuntime({ root: store(), version, target, manifest: fetched, extract: extractor })
    assert.equal(readFileSync(join(result.root, 'ready'), 'utf8'), 'ready')
  } finally { await new Promise(done => server.close(done)) }
})
