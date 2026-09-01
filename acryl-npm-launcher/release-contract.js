import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const RECEIPT_SCHEMA_VERSION = 1

export const CLI_TARGETS = Object.freeze({
  'darwin-arm64': { platform: 'darwin', arch: 'arm64', npmOs: 'darwin', npmCpu: 'arm64' },
  'darwin-x64': { platform: 'darwin', arch: 'x64', npmOs: 'darwin', npmCpu: 'x64' },
  'linux-arm64': { platform: 'linux', arch: 'arm64', npmOs: 'linux', npmCpu: 'arm64' },
  'linux-x64': { platform: 'linux', arch: 'x64', npmOs: 'linux', npmCpu: 'x64' },
  'windows-x64': { platform: 'win32', arch: 'x64', npmOs: 'win32', npmCpu: 'x64' },
})

export function targetForNode({ platform, arch }) {
  const target = Object.entries(CLI_TARGETS).find(([, value]) => value.platform === platform && value.arch === arch)?.[0]
  if (!target) throw new Error(`unsupported ACRYL target: ${platform}/${arch}. Supported targets: ${Object.keys(CLI_TARGETS).join(', ')}`)
  return target
}

export function targetPackageName(target) {
  if (!CLI_TARGETS[target]) throw new Error(`unknown ACRYL target: ${target}`)
  return `acryl-cli-${target}`
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Hash a prepared runtime tree in a stable, receipt-excluding form. */
export function payloadSha256(directory) {
  const entries = []
  const visit = current => {
    for (const entry of readdirSync(current)) {
      const absolute = join(current, entry)
      const path = relative(directory, absolute).replaceAll('\\\\', '/')
      if (path === 'receipt.json') continue
      if (statSync(absolute).isDirectory()) visit(absolute)
      else entries.push(`${path}\u0000${sha256(readFileSync(absolute))}`)
    }
  }
  visit(directory)
  return sha256(entries.sort().join('\n'))
}

export function receiptFor({ surface = 'cli', target, version, payloadSha256 }) {
  if (!CLI_TARGETS[target]) throw new Error(`unknown ACRYL target: ${target}`)
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`invalid release version: ${version}`)
  if (!/^[a-f0-9]{64}$/u.test(payloadSha256)) throw new Error('receipt payloadSha256 must be a SHA-256 hex digest')
  return { schemaVersion: RECEIPT_SCHEMA_VERSION, surface, target, version, packageName: targetPackageName(target), payloadSha256 }
}

export function validateReceipt(receipt, { surface = 'cli', target, version, packageName = targetPackageName(target) } = {}) {
  if (!receipt || typeof receipt !== 'object') throw new Error('runtime receipt is missing or invalid')
  if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION) throw new Error(`unsupported runtime receipt schema: ${String(receipt.schemaVersion)}`)
  for (const [key, expected] of Object.entries({ surface, target, version, packageName })) {
    if (expected !== undefined && receipt[key] !== expected) throw new Error(`runtime receipt ${key} mismatch: expected ${expected}, found ${String(receipt[key])}`)
  }
  if (!/^[a-f0-9]{64}$/u.test(receipt.payloadSha256)) throw new Error('runtime receipt has invalid payloadSha256')
  return receipt
}

export function validatePayloadReceipt(receipt, directory) {
  const actual = payloadSha256(directory)
  if (receipt.payloadSha256 !== actual) throw new Error(`runtime receipt payload hash mismatch: expected ${receipt.payloadSha256}, found ${actual}`)
  return receipt
}

export function readAndValidateReceipt(path, expected) {
  let receipt
  try { receipt = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error('runtime receipt is missing or invalid JSON') }
  return validateReceipt(receipt, expected)
}
