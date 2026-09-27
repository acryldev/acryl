// generateLock: resolved definition -> blend.lock.json (governing spec 6.4,
// M2 D15, FR-M2-1). The lock records the resolved technical state - origin
// identity plus the resolved rows - so an owned Blend is reproducible and
// diffable without re-resolution. JSON text is deterministic by construction
// (SC-M2-1): fixed key order and 2-space indentation.
import type { BlendLock, LockGenerator, LockModule, LockOrigin, ResolvedDefinition } from './document.js'

// Version truth: kept in lockstep with packages/blends-core/package.json.
// unit/lock.spec.ts asserts the two match so they cannot drift silently.
export const BLENDS_CORE_VERSION = '0.1.0'

export interface LockResult {
  lock: BlendLock
  /** Deterministic JSON text: `JSON.stringify(lock, null, 2) + '\n'`. */
  json: string
}

const DEFAULT_GENERATOR: LockGenerator = { name: '@webboxes/blends-core', version: BLENDS_CORE_VERSION }

/**
 * Generate a lock (spec-004, FR-M4-2): v1 by default, or v2 when `modules`
 * is given. `modules` is sorted by `name` here (not left to the caller) so
 * v2 output stays deterministic (SC-M4-1) the same way v1's field order
 * already is - two calls over the same resolved state and modules produce
 * byte-identical JSON regardless of the input array's order.
 */
export function generateLock(
  resolved: ResolvedDefinition,
  origin: LockOrigin,
  generator?: LockGenerator,
  modules?: readonly LockModule[],
): LockResult {
  const lock: BlendLock = modules === undefined
    ? { formatVersion: 1, generator: generator ?? DEFAULT_GENERATOR, origin, rows: resolved.spec.rows }
    : {
      formatVersion: 2,
      generator: generator ?? DEFAULT_GENERATOR,
      origin,
      rows: resolved.spec.rows,
      modules: [...modules].sort((left, right) => left.name.localeCompare(right.name)),
    }
  return { lock, json: `${JSON.stringify(lock, null, 2)}\n` }
}
