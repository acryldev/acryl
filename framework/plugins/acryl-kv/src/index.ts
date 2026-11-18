/**
 * The `kv` port: named JSON documents for an app too small for SQL, whichever provider serves it (`acryl-kv-json` for one file,
 * `acryl-kv-db` over the `db` port). Plain code opens a store with a provider's `openKv`; a Cordis plugin declares `inject: ['kv']`, imports
 * `acryl-kv/cordis` for the `ctx.kv` type, and never imports a provider.
 *
 * This entry imports nothing from Cordis, at runtime or in its types.
 */

/** The service name every `kv` provider registers. */
export const KV_SERVICE = 'kv'

export type { JsonValue, Kv, KvOpened, NotPromise } from './kv.ts'
export { checkKey, codePoints, compareKeys, decodeValue, encodeValue, runChange } from './check.ts'
export { copyKv, type CopyKvOptions, type CopyKvResult } from './copy.ts'
