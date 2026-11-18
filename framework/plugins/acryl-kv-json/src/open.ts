/**
 * The plain way to open the JSON-file provider, for code without Cordis (an acrylblends app): `openKv({ path })` reads one JSON file into
 * memory and resolves the `kv` port with the function that closes it. The Cordis plugin is a thin wrapper over this, so both run one code
 * path. This entry imports nothing from Cordis.
 *
 * Every write persists the whole map: serialize to a temporary file in the same folder, flush it, rename it over the file, and flush the
 * folder where the platform allows. The call resolves after the rename, so a crash leaves the old file or the new one, never half of one.
 * Writes are grouped: the calls made in one turn of the event loop, and those that queue while a file write is in flight, are applied in
 * call order and persisted together by one write, so a burst of calls costs one flush and one rename, not one each (on Windows each costs
 * tens of milliseconds). One process owns the
 * file: two writers would overwrite each other.
 */

import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { checkKey, compareKeys, decodeValue, encodeValue, type Kv, type KvOpened, runChange } from 'acryl-kv'

export type { Kv, KvOpened } from 'acryl-kv'

export interface OpenKvOptions {
  /** The JSON file; its folder is created if missing. */
  readonly path: string
}

/** The file's own format version, for a later change of layout. */
const FORMAT = 1

/** Stray temporary files from a crash end in `.tmp` and start with the file's name. */
const tempPrefix = (file: string): string => `${basename(file)}.`

/** The file content for a map of key to JSON text, keys in code point order, so the same data is the same bytes. */
function serialize(entries: ReadonlyMap<string, string>): string {
  const body = [...entries.keys()].sort(compareKeys).map(key => `${JSON.stringify(key)}:${entries.get(key)}`).join(',')
  return `{"version":${FORMAT},"entries":{${body}}}\n`
}

function unreadable(file: string, reason: string): Error {
  return new Error(`acryl-kv-json: ${file} is not a readable kv file (${reason}); it was not changed`)
}

/** The entries of a file, or none when it does not exist. A file that exists and does not parse is an error: it is never started over. */
async function load(file: string): Promise<Map<string, string>> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw unreadable(file, (error as Error).message)
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { version?: unknown }).version !== FORMAT) throw unreadable(file, 'not a version 1 kv file')
  const entries = (parsed as { entries?: unknown }).entries
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) throw unreadable(file, 'no entries object')
  return new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]))
}

/** Remove the temporary files an earlier crash left beside the file. */
async function removeStrays(file: string): Promise<void> {
  const prefix = tempPrefix(file)
  for (const name of await readdir(dirname(file))) {
    if (name.startsWith(prefix) && name.endsWith('.tmp')) await rm(join(dirname(file), name), { force: true })
  }
}

const RENAME_RETRIES = 8

/** Rename over the target. Windows refuses while a scanner or an indexer holds the target for a moment, so it is retried briefly. */
async function replace(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= RENAME_RETRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error
      await new Promise(resolveWait => setTimeout(resolveWait, 10 * (attempt + 1)))
    }
  }
}

/** Flush the folder entry of a renamed file (POSIX); Windows cannot open a folder, and a filesystem that refuses is no worse than before. */
async function flushFolder(folder: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    const handle = await open(folder, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Best effort: the rename itself is already atomic.
  }
}

/** What one call does to the map: the key's new JSON text (`undefined` deletes it), and what the call resolves with. */
interface Change<T = unknown> {
  readonly key: string
  readonly text: string | undefined
  readonly result: T
}

/** A call waiting for the file write that will contain it. Its change reads the state as the calls before it in the round left it. */
interface Pending {
  readonly change: (read: (key: string) => string | undefined) => Change
  readonly resolve: (result: unknown) => void
  readonly reject: (error: unknown) => void
}

/** Open (and create, when missing) a JSON-file store. @throws when the file exists and is not a readable kv file. */
export async function openKv(options: OpenKvOptions): Promise<KvOpened> {
  const file = resolve(options.path)
  await mkdir(dirname(file), { recursive: true })
  await removeStrays(file)
  let state = await load(file)
  let closed = false
  let sequence = 0
  /** Calls waiting for the next file write, in call order. */
  let queue: Pending[] = []
  /** Whether the loop that writes the queue runs; cleared by the loop itself, so a call queued after it ends starts a new one. */
  let draining = false
  /** The latest loop, for `close` to wait on. */
  let drained: Promise<void> = Promise.resolve()

  const guard = (): void => {
    if (closed) throw new Error(`acryl-kv-json: ${file} is closed`)
  }

  /** Persist a map: the file is the old one or this one, never between. */
  const persist = async (next: ReadonlyMap<string, string>): Promise<void> => {
    sequence += 1
    const temp = join(dirname(file), `${tempPrefix(file)}${process.pid}.${sequence}.tmp`)
    try {
      const handle = await open(temp, 'w')
      try {
        await handle.writeFile(serialize(next), 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await replace(temp, file)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    await flushFolder(dirname(file))
  }

  /**
   * Write the queue until it is empty. Each round takes every call queued so far and applies them in order to one copy of the state. A call
   * whose change throws rejects with its error and changes nothing, and the others in the round still apply. The copy becomes the state
   * only once it is on disk. A failed file write rejects every call in its round and leaves the state as it was.
   */
  const drain = async (): Promise<void> => {
    try {
      // Let the calls made in this turn join the first round.
      await Promise.resolve()
      await rounds()
    } finally {
      draining = false
    }
  }

  const rounds = async (): Promise<void> => {
    while (queue.length > 0) {
      const round = queue
      queue = []
      const draft = new Map(state)
      const applied: { readonly call: Pending; readonly result: unknown }[] = []
      for (const call of round) {
        let change: Change
        try {
          change = call.change(key => draft.get(key))
        } catch (error) {
          call.reject(error)
          continue
        }
        if (change.text === undefined) draft.delete(change.key)
        else draft.set(change.key, change.text)
        applied.push({ call, result: change.result })
      }
      if (applied.length === 0) continue
      try {
        await persist(draft)
      } catch (error) {
        for (const { call } of applied) call.reject(error)
        continue
      }
      state = draft
      for (const { call, result } of applied) call.resolve(result)
    }
  }

  /** Queue one change behind every earlier call; it resolves once a file write that contains it is on disk. */
  const write = <T>(change: (read: (key: string) => string | undefined) => Change<T>): Promise<T> => {
    guard()
    const done = new Promise<T>((resolveCall, rejectCall) => {
      queue.push({ change, resolve: resolveCall as (result: unknown) => void, reject: rejectCall })
    })
    if (!draining) {
      draining = true
      drained = drain()
    }
    return done
  }

  const kv: Kv = {
    async get<T>(key: string) {
      guard()
      checkKey(key)
      const text = state.get(key)
      return text === undefined ? undefined : decodeValue<T>(text)
    },
    async set(key, value) {
      checkKey(key)
      const text = encodeValue(value)
      await write(() => ({ key, text, result: undefined }))
    },
    async update<T>(key: string, change: (current: T | undefined) => T) {
      checkKey(key)
      return write(read => {
        const text = read(key)
        const encoded = encodeValue(runChange(change, text === undefined ? undefined : decodeValue<T>(text)))
        return { key, text: encoded, result: decodeValue<T>(encoded) }
      })
    },
    async delete(key) {
      checkKey(key)
      await write(() => ({ key, text: undefined, result: undefined }))
    },
    async list(prefix = '') {
      guard()
      return [...state.keys()].filter(key => key.startsWith(prefix)).sort(compareKeys)
    },
  }

  return {
    kv,
    close: async () => {
      closed = true
      await drained
    },
  }
}
