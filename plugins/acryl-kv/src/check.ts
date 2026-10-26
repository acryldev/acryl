/**
 * What every `kv` provider checks the same way, so a bad call fails alike on a file and on SQL: the key, the value, and the order of keys.
 */

/** A key is a non-empty string. */
export function checkKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key === '') throw new TypeError(`a kv key is a non-empty string, got ${typeof key === 'string' ? 'an empty string' : typeof key}`)
}

/**
 * The JSON text of a value. `undefined`, functions, symbols, bigints, circular structures and non-finite numbers (which JSON would turn
 * into `null`) are refused with a `TypeError`; nothing is stored for them.
 */
export function encodeValue(value: unknown): string {
  const text = JSON.stringify(value, (_key, part: unknown) => {
    if (typeof part === 'number' && !Number.isFinite(part)) throw new TypeError(`a kv value is JSON; ${String(part)} is not`)
    return part
  })
  if (text === undefined) throw new TypeError(`a kv value is JSON; ${typeof value} is not`)
  return text
}

/** The value of stored JSON text: a new copy each time, so changing what `get` returned changes nothing stored. */
export function decodeValue<T>(text: string): T {
  return JSON.parse(text) as T
}

/** Order two keys by code point (the order of UTF-8 bytes, which SQLite's binary collation and Postgres' "C" collation give too). */
export function compareKeys(a: string, b: string): number {
  if (a === b) return 0
  // UTF-16 order puts astral characters (surrogates, D800-DFFF) before U+E000-U+FFFF; moving the surrogates above them gives code point order.
  const rank = (unit: number): number => (unit >= 0xd800 ? (unit >= 0xe000 ? unit - 0x800 : unit + 0x2000) : unit)
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const difference = rank(a.charCodeAt(index)) - rank(b.charCodeAt(index))
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

/** The number of code points in a string (what SQL's `substr` counts). */
export function codePoints(text: string): number {
  let count = 0
  for (const _ of text) count += 1
  return count
}

/**
 * Call an `update` callback and check what it returns: the callback is synchronous, so a promise (an `async` function the types should have
 * refused) is rejected with a message that says what to do, instead of being stored as `{}`.
 */
export function runChange<T>(change: (current: T | undefined) => T, current: T | undefined): T {
  const next: unknown = change(current)
  if (typeof next === 'object' && next !== null && typeof (next as { then?: unknown }).then === 'function') {
    throw new TypeError('the callback of kv.update is synchronous and returned a promise: read what you need first (await kv.get), then update with a plain function')
  }
  return next as T
}
