import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const RECEIPT_NAME = '.acryl-web-runtime.json'
const DEFAULT_RELEASE = 'https://github.com/acryldev/acryl/releases/download'

function fail(message) { throw new Error(`acryl web: ${message}`) }

export function managedWebRoot(env = process.env) {
  if (env.ACRYL_WEB_HOME) return env.ACRYL_WEB_HOME
  if (process.platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Acryl', 'web')
  return join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'acryl', 'web')
}

export function manifestUrl(version, env = process.env) {
  return env.ACRYL_RELEASE_MANIFEST_URL ?? `${DEFAULT_RELEASE}/v${version}/release-manifest.json`
}

export function confirmWebAcquisition({ yes, interactive, confirm }) {
  if (yes) return true
  return interactive && confirm !== undefined ? confirm() : false
}

export function selectWebArtifact(manifest, { version, target }) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.schemaVersion !== 1 || typeof manifest.version !== 'string' || !Array.isArray(manifest.artifacts)) {
    fail('release manifest is malformed')
  }
  if (manifest.version !== version) fail(`release manifest version ${manifest.version} does not match installed CLI version ${version}`)
  const matches = manifest.artifacts.filter(artifact => artifact !== null && typeof artifact === 'object'
    && artifact.surface === 'web' && artifact.target === target)
  if (matches.length !== 1) fail(`release manifest does not contain a Web artifact for version ${version} target ${target}`)
  const artifact = matches[0]
  let url
  try { url = new URL(artifact.location, manifest.artifactBaseUrl).toString() } catch { fail(`Web artifact for version ${version} target ${target} has an invalid location`) }
  if (typeof artifact.location !== 'string'
    || artifact.integrity?.algorithm !== 'sha256' || typeof artifact.integrity.value !== 'string' || !/^[a-f0-9]{64}$/u.test(artifact.integrity.value)
    || artifact.receipt?.schemaVersion !== 1 || artifact.receipt.surface !== 'web' || artifact.receipt.target !== target
    || artifact.receipt.version !== version || artifact.receipt.location !== artifact.location
    || artifact.receipt.integrity?.algorithm !== 'sha256' || artifact.receipt.integrity?.value !== artifact.integrity.value
    || artifact.receipt.capabilityBaseline !== manifest.capabilityBaseline) {
    fail(`Web artifact for version ${version} target ${target} is malformed`)
  }
  return { ...artifact, url, sha256: artifact.integrity.value }
}

function receiptPath(root) { return join(root, RECEIPT_NAME) }

export function hasVerifiedWebRuntime(root, { version, target, sha256 }) {
  try {
    const receipt = JSON.parse(readFileSync(receiptPath(root), 'utf8'))
    const launcher = join(root, 'runtime', 'bin', process.platform === 'win32' ? 'acryl-web.cmd' : 'acryl-web')
    return receipt?.schemaVersion === 1 && receipt.surface === 'web'
      && receipt.version === version && receipt.target === target && receipt.integrity?.algorithm === 'sha256'
      && receipt.integrity?.value === sha256 && existsSync(launcher)
  } catch { return false }
}

function defaultExtract(archive, destination) {
  execFileSync('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '--strip-components=1', '-C', destination])
}

async function defaultDownload(url) {
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) fail(`Web artifact download failed: ${response.status} ${response.statusText}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Fetch, verify, extract, and atomically commit a target-specific Web runtime.
 * The only durable record is an integrity receipt and executable payload.
 */
export async function acquireWebRuntime({
  root = managedWebRoot(), version, target, manifest, download = defaultDownload, extract = defaultExtract,
}) {
  const artifact = selectWebArtifact(manifest, { version, target })
  const installed = join(root, version, target)
  if (hasVerifiedWebRuntime(installed, { version, target, sha256: artifact.sha256 })) return { root: installed, artifact, reused: true }

  mkdirSync(dirname(installed), { recursive: true })
  const staging = `${installed}.install-${randomUUID()}`
  const archive = join(staging, 'runtime.tar.gz')
  try {
    mkdirSync(staging, { recursive: true })
    const bytes = await download(artifact.url)
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    const actual = createHash('sha256').update(buffer).digest('hex')
    if (actual !== artifact.sha256) fail(`Web artifact checksum verification failed for version ${version} target ${target}`)
    writeFileSync(archive, buffer, { mode: 0o600 })
    extract(archive, staging)
    rmSync(archive, { force: true })
    const launcher = join(staging, 'runtime', 'bin', process.platform === 'win32' ? 'acryl-web.cmd' : 'acryl-web')
    if (!existsSync(launcher)) fail(`Web runtime readiness check failed for version ${version} target ${target}`)
    writeFileSync(receiptPath(staging), `${JSON.stringify(artifact.receipt)}\n`, { mode: 0o600 })
    // Do not replace a previously verified cache. A concurrent verified install wins.
    if (existsSync(installed)) {
      if (hasVerifiedWebRuntime(installed, { version, target, sha256: artifact.sha256 })) return { root: installed, artifact, reused: true }
      const previous = `${installed}.previous-${randomUUID()}`
      renameSync(installed, previous)
      try {
        renameSync(staging, installed)
      } catch (cause) {
        renameSync(previous, installed)
        throw cause
      }
      rmSync(previous, { recursive: true, force: true })
      return { root: installed, artifact, reused: false }
    }
    renameSync(staging, installed)
    return { root: installed, artifact, reused: false }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export async function fetchReleaseManifest(url = manifestUrl('unknown')) {
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) fail(`release manifest lookup failed: ${response.status} ${response.statusText}`)
  try {
    const manifest = await response.json()
    return { ...manifest, artifactBaseUrl: url }
  } catch { fail('release manifest is malformed') }
}
