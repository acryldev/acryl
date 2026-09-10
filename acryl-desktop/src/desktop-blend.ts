/** BLEND lock consumption for desktop profile composition (spec 003, D22-D27). */

import { readFileSync, statSync } from 'node:fs'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/**
 * The owned-Blend lock file layout produced by `blends init` (D15/D19). The
 * desktop reads only the lock - a resolved Cordis row list with origin
 * identity - never the BLEND definition language itself (D12).
 */
export const BLEND_LOCK_RELATIVE_PATH = '.acryl/blend.lock.json'

/** The only lock layout version the desktop understands. */
export const BLEND_LOCK_FORMAT_VERSION = 1

const BIN_NAME = 'acryl-desktop'
const MAX_LOCK_BYTES = 1024 * 1024
const MAX_BLEND_ROWS = 4096
const MAX_BLEND_STRING = 2048
const MAX_IDENTITY_STRING = 256
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

/** Origin identity recorded in the lock by the blends generator. */
export interface DesktopBlendOrigin {
  readonly id: string
  readonly kind: 'Blueprint' | 'Blend'
  readonly version: string
  /** sha256:<hex> over the origin definition bytes, computed by the generator. */
  readonly digest: string
}

/** One resolved Cordis row locked by the generator, shaped as an EntryOptions fragment. */
export interface DesktopBlendRowEntry {
  readonly id: string
  readonly name: string
  readonly config?: Record<string, unknown>
  readonly disabled?: boolean
}

/** Trusted projection of one owned Blend lock, consumed by composition and lifecycle. */
export interface DesktopBlendProjection {
  /** Exact lock file path this projection was read from. */
  readonly lockPath: string
  readonly generator: { readonly name: string, readonly version: string }
  readonly origin: DesktopBlendOrigin
  readonly rows: readonly DesktopBlendRowEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(lockPath: string, detail: string): never {
  throw new Error(`${BIN_NAME}: BLEND lock at ${lockPath} ${detail}`)
}

function lockString(
  value: unknown,
  field: string,
  lockPath: string,
  max = MAX_BLEND_STRING,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail(lockPath, `has a ${field} that is not a non-empty string of at most ${String(max)} characters`)
  }
  return value
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

/** Resolve a `dsh-desktop.blend` path to the lock file it designates. */
export function resolveBlendLockPath(blendPath: string): string {
  let stats
  try {
    stats = statSync(blendPath)
  } catch (cause) {
    throw new Error(`${BIN_NAME}: BLEND path '${blendPath}' does not exist (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  if (stats.isDirectory()) return joinLockPath(blendPath, BLEND_LOCK_RELATIVE_PATH)
  return blendPath
}

function joinLockPath(directory: string, relative: string): string {
  return directory.endsWith('/') ? `${directory}${relative}` : `${directory}/${relative}`
}

/**
 * Validate one parsed lock document. The lock is untrusted local data with a
 * 16x-smaller budget than the runtime: every field is checked, unknown keys
 * are rejected, and failures name the lock and the offending field.
 */
export function parseBlendLock(raw: unknown, lockPath: string): DesktopBlendProjection {
  if (!isRecord(raw) || !hasExactKeys(raw, ['formatVersion', 'generator', 'origin', 'rows'])) {
    fail(lockPath, `must be a map with exactly the keys formatVersion, generator, origin, rows`)
  }
  const record = raw
  if (record.formatVersion !== BLEND_LOCK_FORMAT_VERSION) {
    fail(lockPath, `has formatVersion ${JSON.stringify(record.formatVersion)}, expected ${String(BLEND_LOCK_FORMAT_VERSION)}`)
  }
  if (!isRecord(record.generator)
    || !hasExactKeys(record.generator, ['name', 'version'])) {
    fail(lockPath, 'has a generator that is not a map with exactly the keys name, version')
  }
  const generator = record.generator
  if (!isRecord(record.origin) || !hasExactKeys(record.origin, ['id', 'kind', 'version', 'digest'])) {
    fail(lockPath, 'has an origin that is not a map with exactly the keys id, kind, version, digest')
  }
  const origin = record.origin
  if (origin.kind !== 'Blueprint' && origin.kind !== 'Blend') {
    fail(lockPath, `has an origin kind ${JSON.stringify(origin.kind)}, expected 'Blueprint' or 'Blend'`)
  }
  const digest = lockString(origin.digest, 'origin digest', lockPath, MAX_IDENTITY_STRING)
  if (!DIGEST_PATTERN.test(digest)) {
    fail(lockPath, `has an origin digest that is not 'sha256:' followed by 64 lowercase hex characters`)
  }
  if (!Array.isArray(record.rows) || record.rows.length > MAX_BLEND_ROWS) {
    fail(lockPath, `has rows that are not an array of at most ${String(MAX_BLEND_ROWS)} rows`)
  }
  return Object.freeze({
    lockPath,
    generator: Object.freeze({
      name: lockString(generator.name, 'generator name', lockPath, MAX_IDENTITY_STRING),
      version: lockString(generator.version, 'generator version', lockPath, MAX_IDENTITY_STRING),
    }),
    origin: Object.freeze({
      id: lockString(origin.id, 'origin id', lockPath, MAX_IDENTITY_STRING),
      kind: origin.kind,
      version: lockString(origin.version, 'origin version', lockPath, MAX_IDENTITY_STRING),
      digest,
    }),
    rows: Object.freeze(record.rows.map(row => parseBlendRow(row, lockPath))),
  })
}

function parseBlendRow(raw: unknown, lockPath: string): DesktopBlendRowEntry {
  if (!isRecord(raw)) fail(lockPath, 'contains a row that is not a map')
  const row = raw
  const keys = Object.keys(row).sort()
  const known = ['config', 'disabled', 'id', 'name']
  for (const key of keys) {
    if (!known.includes(key)) {
      fail(lockPath, `contains a row with an unknown key '${key}'`)
    }
  }
  const id = lockString(row.id, 'row id', lockPath)
  const name = lockString(row.name, 'row name', lockPath, MAX_BLEND_STRING)
  let config: Record<string, unknown> | undefined
  if (row.config !== undefined) {
    if (!isRecord(row.config)) fail(lockPath, `contains row '${id}' whose config is not a map`)
    config = row.config
  }
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean') {
    fail(lockPath, `contains row '${id}' whose disabled is not a boolean`)
  }
  return Object.freeze({
    id,
    name,
    ...(config === undefined ? {} : { config }),
    ...(row.disabled === undefined ? {} : { disabled: row.disabled }),
  } satisfies DesktopBlendRowEntry)
}

/**
 * Read and validate the lock for a configured `dsh-desktop.blend` path.
 * Fails the generation loudly: the user asked for this BLEND by name.
 */
export function readDesktopBlend(blendPath: string): DesktopBlendProjection {
  const lockPath = resolveBlendLockPath(blendPath)
  let text: string
  try {
    text = readFileSync(lockPath, 'utf8')
  } catch (cause) {
    throw new Error(`${BIN_NAME}: BLEND path '${blendPath}' resolved to lock '${lockPath}' which could not be read (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  if (text.length > MAX_LOCK_BYTES) {
    fail(lockPath, `is larger than ${String(MAX_LOCK_BYTES)} bytes`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (cause) {
    fail(lockPath, `is not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  return parseBlendLock(raw, lockPath)
}

/** Project the lock into the one insert patch BLEND composition contributes. */
export function blendInsertPatch(projection: DesktopBlendProjection): PatchOptions {
  return {
    insert: projection.rows.map(row => ({
      id: row.id,
      name: row.name,
      ...(row.config === undefined ? {} : { config: row.config }),
      ...(row.disabled === undefined ? {} : { disabled: row.disabled }),
    })),
  }
}

/** Entry ids the plugin lifecycle treats as user-mutable because this BLEND owns them. */
export function blendRowIds(projection: DesktopBlendProjection): ReadonlySet<string> {
  return new Set(projection.rows.map(row => row.id))
}

/**
 * Reject a BLEND row id that would collide with an already-composed profile
 * row. Without this the failure surfaces later as a generic unique-id throw;
 * here it names the BLEND and the offending row.
 */
export function assertNoBlendRowCollisions(
  projection: DesktopBlendProjection,
  baseRows: Iterable<{ readonly id: unknown }>,
): void {
  const baseIds = new Set<string>()
  for (const row of baseRows) {
    if (typeof row.id === 'string') baseIds.add(row.id)
  }
  for (const row of projection.rows) {
    if (baseIds.has(row.id)) {
      throw new Error(`${BIN_NAME}: BLEND '${projection.origin.id}' row '${row.id}' collides with an existing profile row of the same id; rename the row in the BLEND`)
    }
    baseIds.add(row.id)
  }
}
