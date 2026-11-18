/** `T`, except a promise: the callback of `update` is synchronous, and an async one is a type error. */
export type NotPromise<T> = T extends PromiseLike<unknown> ? never : T

/** Anything JSON can hold. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/**
 * Named JSON documents. Every call returns a promise, so a file, SQLite and Postgres answer alike.
 *
 * Keys are non-empty strings. Values are JSON: `undefined`, functions, symbols, bigints and non-finite numbers are refused with a
 * `TypeError` before anything is written, and a value read back is a copy.
 *
 * There is no `close`: the code that opened a store closes it (see {@link KvOpened}), so a plugin cannot close the store another uses.
 */
export interface Kv {
  /** The value stored under the key, or `undefined`. */
  get<T = JsonValue>(key: string): Promise<T | undefined>
  /** Store a value under the key, replacing any. Resolves once it is durable. */
  set<T = JsonValue>(key: string, value: T): Promise<void>
  /**
   * Replace the value under the key by `change(current)`, atomically: `current` is `undefined` when the key is missing, `change` is
   * synchronous (an `async` function is a type error, and a returned promise is rejected at run time: read what you need first, then update), and no other write to the key happens between reading it and writing the result. Resolves the new value. A `change` that
   * throws, or returns something that is not JSON, leaves the value as it was and rejects with its error.
   */
  update<T = JsonValue>(key: string, change: (current: T | undefined) => NotPromise<T>): Promise<T>
  /** Remove the key. A missing key is not an error. */
  delete(key: string): Promise<void>
  /** The keys that start with the prefix (all of them without one), sorted by code point (the order of their UTF-8 bytes, not of UTF-16 units). */
  list(prefix?: string): Promise<string[]>
}

/** An open store and the one function that closes it. */
export interface KvOpened {
  readonly kv: Kv
  /** Waits for the writes in flight, then releases the storage. Calling it again does nothing; calls on `kv` after it reject. */
  close(): Promise<void>
}
