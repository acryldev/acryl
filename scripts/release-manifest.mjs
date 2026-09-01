#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_TARGETS } from './release-contract.mjs'

export { CLI_TARGETS }
export const RELEASE_MANIFEST_SCHEMA_VERSION = 1
export const CAPABILITY_BASELINE = 'acryl-capability-baseline-v1'
export const DESKTOP_TARGETS = Object.freeze(['macos-arm64', 'macos-x64', 'linux-arm64', 'linux-x64', 'windows-x64'])
export const CLEAN_INSTALL_BUDGET = Object.freeze({ maximumBytes: 350_000_000, maximumMilliseconds: 60_000 })

const SURFACE_TARGETS = Object.freeze({
  cli: Object.keys(CLI_TARGETS),
  web: Object.keys(CLI_TARGETS),
  desktop: DESKTOP_TARGETS,
})

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`)
  return value
}

function validDigest(value, field = 'integrity.value') {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${field} must be a SHA-256 hex digest`)
  return value
}

function expectedTargets(surface) {
  const targets = SURFACE_TARGETS[surface]
  if (!targets) throw new Error(`unknown release surface: ${String(surface)}`)
  return targets
}

export function createArtifactReceipt({ surface, target, version, capabilityBaseline = CAPABILITY_BASELINE, location, integrity, cleanInstall }) {
  expectedTargets(surface)
  if (!expectedTargets(surface).includes(target)) throw new Error(`unsupported ${surface} target: ${String(target)}`)
  const receipt = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    surface,
    target,
    version: nonEmptyString(version, 'version'),
    capabilityBaseline: nonEmptyString(capabilityBaseline, 'capabilityBaseline'),
    location: nonEmptyString(location, 'location'),
    integrity: { algorithm: 'sha256', value: validDigest(integrity?.value) },
  }
  if (surface === 'cli') {
    if (!cleanInstall || !Number.isSafeInteger(cleanInstall.bytes) || cleanInstall.bytes < 0 || !Number.isSafeInteger(cleanInstall.milliseconds) || cleanInstall.milliseconds < 0) {
      throw new Error('CLI receipt cleanInstall must contain non-negative integer bytes and milliseconds')
    }
    receipt.cleanInstall = cleanInstall
  }
  return receipt
}

export function validateArtifactReceipt(receipt, expected = {}) {
  if (!receipt || typeof receipt !== 'object') throw new Error('artifact receipt is missing or invalid')
  if (receipt.integrity?.algorithm !== 'sha256') throw new Error('artifact receipt integrity algorithm must be sha256')
  const normalized = createArtifactReceipt(receipt)
  for (const field of ['surface', 'target', 'version', 'capabilityBaseline', 'location']) {
    if (expected[field] !== undefined && normalized[field] !== expected[field]) {
      throw new Error(`artifact receipt ${field} mismatch: expected ${expected[field]}, found ${normalized[field]}`)
    }
  }
  if (normalized.integrity.algorithm !== 'sha256') throw new Error('artifact receipt integrity algorithm must be sha256')
  return normalized
}

export function verifyCleanInstallBudget(cleanInstall, budget = CLEAN_INSTALL_BUDGET) {
  if (cleanInstall.bytes > budget.maximumBytes) throw new Error(`clean install size budget exceeded: ${cleanInstall.bytes} > ${budget.maximumBytes}`)
  if (cleanInstall.milliseconds > budget.maximumMilliseconds) throw new Error(`clean install time budget exceeded: ${cleanInstall.milliseconds} > ${budget.maximumMilliseconds}`)
}

export function validateReceiptFiles(receiptPaths) {
  for (const path of receiptPaths) {
    const receipt = JSON.parse(readFileSync(path, 'utf8'))
    validateArtifactReceipt(receipt)
    const artifact = resolve(dirname(path), receipt.location)
    if (!existsSync(artifact)) throw new Error(`artifact receipt location is absent: ${receipt.location}`)
    const actual = sha256File(artifact)
    if (actual !== receipt.integrity.value) throw new Error(`artifact receipt checksum mismatch: ${receipt.location}`)
  }
}

export function createReleaseManifest({ version, capabilityBaseline = CAPABILITY_BASELINE, receipts }) {
  const normalizedReceipts = receipts.map(receipt => validateArtifactReceipt(receipt, { version, capabilityBaseline }))
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    version: nonEmptyString(version, 'version'),
    capabilityBaseline: nonEmptyString(capabilityBaseline, 'capabilityBaseline'),
    artifacts: normalizedReceipts.map(receipt => ({
      surface: receipt.surface,
      target: receipt.target,
      location: receipt.location,
      receipt: {
        ...receipt,
        integrity: { ...receipt.integrity },
        ...(receipt.cleanInstall ? { cleanInstall: { ...receipt.cleanInstall } } : {}),
      },
      integrity: { ...receipt.integrity },
    })),
  }
}

export function validateReleaseManifest(manifest, { requireComplete = true, budget = CLEAN_INSTALL_BUDGET } = {}) {
  if (!manifest || typeof manifest !== 'object') throw new Error('release manifest is missing or invalid')
  if (manifest.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) throw new Error(`unsupported release manifest schema: ${String(manifest.schemaVersion)}`)
  const version = nonEmptyString(manifest.version, 'manifest.version')
  const capabilityBaseline = nonEmptyString(manifest.capabilityBaseline, 'manifest.capabilityBaseline')
  if (!Array.isArray(manifest.artifacts)) throw new Error('release manifest artifacts must be an array')

  const seen = new Set()
  for (const entry of manifest.artifacts) {
    if (!entry || typeof entry !== 'object') throw new Error('release manifest artifact entry is invalid')
    const surface = nonEmptyString(entry.surface, 'artifact.surface')
    const target = nonEmptyString(entry.target, 'artifact.target')
    if (!expectedTargets(surface).includes(target)) throw new Error(`release manifest has unsupported ${surface} target: ${target}`)
    const key = `${surface}/${target}`
    if (seen.has(key)) throw new Error(`release manifest has duplicate artifact entry: ${key}`)
    seen.add(key)
    const location = nonEmptyString(entry.location, 'artifact.location')
    const integrity = entry.integrity
    if (!integrity || integrity.algorithm !== 'sha256') throw new Error(`artifact ${key} integrity algorithm must be sha256`)
    validDigest(integrity.value, `artifact ${key} integrity.value`)
    const receipt = validateArtifactReceipt(entry.receipt, { surface, target, version, capabilityBaseline, location })
    if (receipt.integrity.value !== integrity.value) throw new Error(`artifact ${key} checksum does not match receipt`)
    if (surface === 'cli') verifyCleanInstallBudget(receipt.cleanInstall, budget)
  }

  if (requireComplete) {
    const missing = Object.entries(SURFACE_TARGETS).flatMap(([surface, targets]) => targets
      .filter(target => !seen.has(`${surface}/${target}`))
      .map(target => `${surface}/${target}`))
    if (missing.length > 0) throw new Error(`release manifest is missing required artifacts: ${missing.join(', ')}`)
  }
  return manifest
}

export function releasePromotionAllowed({ manifest, requiredJobs = [] }) {
  validateReleaseManifest(manifest)
  const failed = requiredJobs.filter(job => job.status !== 'success')
  if (failed.length > 0) throw new Error(`complete release promotion blocked by failed gates: ${failed.map(job => job.name).join(', ')}`)
  return true
}

export function verifyPackageVersions(version, manifests) {
  for (const [path, manifest] of Object.entries(manifests)) {
    if (manifest?.version !== version) throw new Error(`version drift: release ${version} != ${path} ${String(manifest?.version)}`)
  }
}

function usage() {
  return 'usage: node scripts/release-manifest.mjs receipt <surface> <target> <version> <location> <artifact-path> <output> [install-bytes install-ms] | generate <version> <baseline> <output> <receipt...> | validate <manifest> | verify-versions <version> <package.json...>'
}

function main(argv) {
  const [command, ...args] = argv
  if (command === 'receipt') {
    const [surface, target, version, location, artifactPath, output, bytes, milliseconds] = args
    if (!surface || !target || !version || !location || !artifactPath || !output) throw new Error(usage())
    const cleanInstall = surface === 'cli'
      ? { bytes: Number(bytes ?? statSync(artifactPath).size), milliseconds: Number(milliseconds ?? 0) }
      : undefined
    const receipt = createArtifactReceipt({ surface, target, version, location, integrity: { value: sha256File(artifactPath) }, cleanInstall })
    mkdirSync(dirname(resolve(output)), { recursive: true })
    writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n')
    return
  }
  if (command === 'generate') {
    const [version, baseline, output, ...receiptPaths] = args
    if (!version || !baseline || !output || receiptPaths.length === 0) throw new Error(usage())
    validateReceiptFiles(receiptPaths)
    const manifest = createReleaseManifest({ version, capabilityBaseline: baseline, receipts: receiptPaths.map(path => JSON.parse(readFileSync(path, 'utf8'))) })
    validateReleaseManifest(manifest)
    mkdirSync(dirname(resolve(output)), { recursive: true })
    writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n')
    return
  }
  if (command === 'validate') {
    const [path] = args
    if (!path || !existsSync(path)) throw new Error(usage())
    validateReleaseManifest(JSON.parse(readFileSync(path, 'utf8')))
    return
  }
  if (command === 'verify-versions') {
    const [version, ...paths] = args
    if (!version || paths.length === 0) throw new Error(usage())
    verifyPackageVersions(version, Object.fromEntries(paths.map(path => [path, JSON.parse(readFileSync(path, 'utf8'))])))
    return
  }
  throw new Error(usage())
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)) } catch (cause) {
    process.stderr.write(`release-manifest: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exitCode = 1
  }
}
