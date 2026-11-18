/** Pure helpers for layering a user section over a base and for detaching JSON data. */

/** Whether a value is a plain data object (not an array, null, or class instance). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deep-merge `patch` over `base`: plain objects merge key by key, every other value (arrays included) replaces,
 * and `undefined` entries in the patch are skipped.
 */
export function mergeLayers(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = merged[key]
    merged[key] =
      isPlainObject(current) && isPlainObject(value) ? mergeLayers(current, value) : value
  }
  return merged
}

/**
 * Detach one write input and reject anything YAML would distort on a reload round trip: only plain objects, arrays,
 * strings, finite numbers, booleans and `null` pass.
 * @throws TypeError naming the `$`-rooted path of the first rejected value.
 */
export function cloneJsonShaped(root: Record<string, unknown>): Record<string, unknown> {
  const visiting = new WeakSet<object>()
  const clone = (value: unknown, path: string): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`settings: ${path} is a non-finite number`)
      return value
    }
    if (Array.isArray(value)) {
      if (visiting.has(value)) throw new TypeError(`settings: ${path} is a circular reference`)
      visiting.add(value)
      const entries = value.map((entry, index) => clone(entry, `${path}[${String(index)}]`))
      visiting.delete(value)
      return entries
    }
    if (isPlainObject(value)) {
      if (visiting.has(value)) throw new TypeError(`settings: ${path} is a circular reference`)
      visiting.add(value)
      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined) continue
        out[key] = clone(entry, `${path}.${key}`)
      }
      visiting.delete(value)
      return out
    }
    throw new TypeError(
      `settings: ${path} is ${value === undefined ? 'undefined' : `a ${typeof value}`}, which cannot be stored`,
    )
  }
  return clone(root, '$') as Record<string, unknown>
}

/** Structural JSON equality for two detached values. */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((entry, index) => deepEqualJson(entry, b[index]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqualJson(a[key], b[key]))
    )
  }
  return false
}
