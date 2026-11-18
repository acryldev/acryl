import type { Kv } from './kv.ts'

export interface CopyKvOptions {
  /** Replace keys the target already has. Without it, a shared key stops the copy before anything is written. */
  readonly overwrite?: boolean
  /** Copy only the keys that start with this. */
  readonly prefix?: string
}

export interface CopyKvResult {
  /** Keys written to the target. */
  readonly copied: number
  /** Of those, keys the target already had. */
  readonly overwritten: number
}

/**
 * Copy every key of one store into another: the import when an app moves from a JSON file to SQL (the file opened with
 * `acryl-kv-json` is the source, `kvOnDb` the target). The source is not changed.
 * @throws when the target has a key the source has and `overwrite` is not set; nothing is written then.
 */
export async function copyKv(source: Kv, target: Kv, options: CopyKvOptions = {}): Promise<CopyKvResult> {
  const keys = await source.list(options.prefix)
  const existing = new Set(await target.list(options.prefix))
  const shared = keys.filter(key => existing.has(key))
  if (shared.length > 0 && options.overwrite !== true) {
    const shown = shared.slice(0, 5).map(key => JSON.stringify(key)).join(', ')
    throw new Error(`copyKv: the target already has ${shared.length} of these keys (${shown}${shared.length > 5 ? ', ...' : ''}); pass overwrite to replace them`)
  }
  let copied = 0
  for (const key of keys) {
    const value = await source.get(key)
    // A key deleted from the source while copying is not copied.
    if (value === undefined) continue
    await target.set(key, value)
    copied += 1
  }
  return { copied, overwritten: shared.length }
}
