/**
 * The running app's door, reached the way the app's own `acryl` command reaches it: `<app>/.acryl/door.json` names the loopback address and the secret of the
 * app that is running now. The screen is a person's surface, so it may do what the terminal's prompt does: send a publish the person confirmed. Only
 * loopback addresses are used, and a missing or stale file means the app is not running.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export class DoorUnavailable extends Error {}

/** One door answer: `ok` with a `value` (and the door's own `text`), or a refusal with its `code` and `message`. */
export interface DoorAnswer {
  readonly ok: boolean
  readonly value?: unknown
  readonly text?: string
  readonly code?: string
  readonly message?: string
}

export interface Door {
  /** A verb of the app's door (`plugin-list`, `plugin-pull`, `plugin-publish` for the plan, ...). */
  call(folder: string, verb: string, args: Readonly<Record<string, unknown>>): Promise<DoorAnswer>
  /** The person's yes to a publish plan; the app sends it only when the plan still matches. */
  confirmPublish(folder: string, body: Readonly<Record<string, unknown>>): Promise<DoorAnswer>
}

type Fetch = (input: string, init?: { method?: string, headers?: Record<string, string>, body?: string, signal?: AbortSignal }) => Promise<{ json: () => Promise<unknown> }>

const TIMEOUT_MS = 60_000
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const NOT_RUNNING = 'the app is not running: start it from this screen, then try again'

interface DoorFile { readonly url: string, readonly secret: string }

function readDoorFile(folder: string, read: (path: string) => string): DoorFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(read(join(folder, '.acryl', 'door.json')))
  } catch {
    throw new DoorUnavailable(NOT_RUNNING)
  }
  const file = parsed as Partial<DoorFile> | null
  if (typeof file?.url !== 'string' || typeof file.secret !== 'string') throw new DoorUnavailable(NOT_RUNNING)
  let url: URL
  try { url = new URL(file.url) } catch { throw new DoorUnavailable(NOT_RUNNING) }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) throw new DoorUnavailable(NOT_RUNNING)
  return { url: url.origin, secret: file.secret }
}

export function fileDoor(fetchImpl: Fetch = (input, init) => fetch(input, init), read: (path: string) => string = path => readFileSync(path, 'utf8')): Door {
  const post = async (folder: string, path: string, body: unknown): Promise<DoorAnswer> => {
    const file = readDoorFile(folder, read)
    try {
      const response = await fetchImpl(`${file.url}${path}`, {
        method: 'POST', headers: { authorization: `Bearer ${file.secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const answer = await response.json() as DoorAnswer | null
      if (answer === null || typeof answer !== 'object') throw new DoorUnavailable('the app answered with nothing readable')
      return answer
    } catch (cause) {
      if (cause instanceof DoorUnavailable) throw cause
      throw new DoorUnavailable(NOT_RUNNING)
    }
  }
  return {
    call: (folder, verb, args) => post(folder, '/api/acryl-door/call', { verb, args }),
    confirmPublish: (folder, body) => post(folder, '/api/acryl-door/publish-confirmed', body),
  }
}
