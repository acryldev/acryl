/**
 * The running frame's address, kept where the app's own data lives.
 *
 * The generated launcher prints the frame's URL with the launch token in it, and that token is the only way into a frame whose browser session ended.
 * So the address is written where the app keeps its data - its folder under `~/.acryl`, outside the repository - at mint time,
 * owner-only (0600 here; a restricted ACL on Windows), and atomically (a temp file in the same folder renamed over it, so a reader never sees half a
 * record). On every later boot the launcher reuses the stored token instead of minting a new one, so the address - and an open page - survives a
 * restart; `acrylblends open` prints it, and `acrylblends open --new` rotates it (the running host replaces the token in place through
 * `/api/acryl-frame/token/new`), invalidating the old one immediately.
 *
 * DSH's connection package mints its launch token as a random value with no configuration seam (BrowserAuth's constructor calls
 * `processLaunchToken`, cached per process owner). The one seam it offers is the instance field the class keeps: `browserAuth.launchToken`, which
 * `authorizeIndex` and `authenticatedUrl` read on every use. The launcher sets that field from the stored record (guarded: a DSH package whose shape
 * lacks it simply keeps its fresh token), and sets it again on a rotation. Nothing inside the pinned package is edited.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'
import type { Io } from './io'

/** The record's file name inside the app home. */
export const FRAME_URL_FILE = 'frame-url.json'

/** Where a running frame rotates its token: a route the launcher mounts on the frame's own router. */
export const FRAME_TOKEN_PATH = '/api/acryl-frame/token/new'

/** What the launcher writes: the address, the token it carries, the process that wrote it, and when. */
export interface FrameUrlRecord {
  readonly version: 1
  readonly url: string
  readonly token: string
  readonly pid: number
  readonly writtenAt: string
}

/** Where an app keeps its own family: the instance plugin its launcher imports. */
const familyOf = (appRoot: string): string =>
  join(resolve(appRoot), 'plugins', 'instance', 'index.ts')

/**
 * The app home the frame uses, as the app's own family chooses it (`plugins/instance`, which its launcher asks too): the CLI never keeps a second copy
 * of that rule. A folder without the family is not a frame app.
 */
export function frameHome(
  appRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const family = familyOf(appRoot)
  if (!existsSync(family))
    throw new Error(`${appRoot} is not a frame app: it has no plugins/instance/index.ts`)
  const { selectInstance } = createRequire(import.meta.url)(family) as {
    selectInstance(options: { projectRoot: string; env?: Record<string, string | undefined> }): {
      home: string
    }
  }
  return selectInstance({ projectRoot: resolve(appRoot), env }).home
}

export function frameUrlPath(home: string): string {
  return join(home, FRAME_URL_FILE)
}

/** Windows has no mode bits; the equivalent is an ACL with inheritance removed and only this account allowed. Best effort: a failure leaves the
 * inherited ACL, which is still the user's folder on a normal install. */
function restrictToOwner(path: string): void {
  chmodSync(path, 0o600)
  if (process.platform !== 'win32') return
  const user = process.env.USERNAME
  if (user === undefined || user === '') return
  spawnSync('icacls', [path, '/inheritance:r', '/grant:r', `${user}:F`], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

/** The token a frame address carries, if it carries one. */
export function tokenOfFrameUrl(url: string): string | undefined {
  try {
    const token = new URL(url).searchParams.get('token')
    return token === null || token === '' ? undefined : token
  } catch {
    return undefined
  }
}

/** Write the frame's address for `home`, owner-only and atomically. Throws when the folder or file cannot be written; the caller decides whether
 * that is fatal (the launcher prints why and keeps serving the app). */
export function writeFrameUrl(home: string, url: string, pid: number = process.pid): void {
  mkdirSync(home, { recursive: true })
  const record: FrameUrlRecord = {
    version: 1,
    url,
    token: tokenOfFrameUrl(url) ?? '',
    pid,
    writtenAt: new Date().toISOString(),
  }
  const target = frameUrlPath(home)
  const temporary = join(home, `${FRAME_URL_FILE}.${String(pid)}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  restrictToOwner(temporary)
  renameSync(temporary, target)
  restrictToOwner(target)
}

/** Remove the record, but only the one `pid` wrote: a host that is stopping must not erase the address of a newer one that already started. */
export function removeFrameUrl(home: string, pid: number = process.pid): void {
  const record = readFrameUrl(home)
  if (record === undefined || record.pid !== pid) return
  rmSync(frameUrlPath(home), { force: true })
}

/** The record, or undefined when there is none, it is not ours, or it is malformed. */
export function readFrameUrl(home: string): FrameUrlRecord | undefined {
  const path = frameUrlPath(home)
  if (!existsSync(path)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (record.version !== 1) return undefined
  if (typeof record.url !== 'string' || record.url === '') return undefined
  if (typeof record.pid !== 'number' || !Number.isInteger(record.pid)) return undefined
  if (typeof record.writtenAt !== 'string') return undefined
  const token =
    typeof record.token === 'string' ? record.token : (tokenOfFrameUrl(record.url) ?? '')
  return { version: 1, url: record.url, token, pid: record.pid, writtenAt: record.writtenAt }
}

/** Whether something accepts a TCP connection at the record's address (the host process is alive and listening). */
export function frameIsListening(url: string, timeoutMs = 500): Promise<boolean> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return Promise.resolve(false)
  }
  const port = Number(target.port === '' ? (target.protocol === 'https:' ? 443 : 80) : target.port)
  return new Promise((done) => {
    const socket = connect({ host: target.hostname, port })
    const finish = (listening: boolean) => {
      socket.destroy()
      done(listening)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/** What `acrylblends open` found. */
export type FrameUrlLookup =
  | { readonly kind: 'running'; readonly record: FrameUrlRecord }
  | { readonly kind: 'stopped'; readonly record: FrameUrlRecord }
  | { readonly kind: 'none'; readonly home: string }

/** Read the record and say whether the frame it names is still listening. */
export async function lookUpFrameUrl(
  appRoot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<FrameUrlLookup> {
  const home = frameHome(appRoot, env)
  const record = readFrameUrl(home)
  if (record === undefined) return { kind: 'none', home }
  return (await frameIsListening(record.url))
    ? { kind: 'running', record }
    : { kind: 'stopped', record }
}

/** Ask the running host to rotate its token, presenting the current one. Returns the new address, or a reason it failed. */
async function rotateFrameToken(
  record: FrameUrlRecord,
): Promise<{ url: string } | { reason: string }> {
  let origin: string
  try {
    origin = new URL(record.url).origin
  } catch {
    return { reason: 'the stored address is not a URL' }
  }
  let response: Response
  try {
    response = await fetch(`${origin}${FRAME_TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'x-frame-token': record.token, accept: 'application/json' },
    })
  } catch (cause) {
    return { reason: cause instanceof Error ? cause.message : String(cause) }
  }
  if (!response.ok) return { reason: `the host answered ${String(response.status)}` }
  const body = (await response.json().catch(() => undefined)) as { url?: unknown } | undefined
  if (typeof body?.url !== 'string' || body.url === '')
    return { reason: 'the host answered without an address' }
  return { url: body.url }
}

/**
 * `acrylblends open [dir] [--new]`: print the address of the frame running the app in this folder, so a page whose session ended (or the person, after
 * a restart) can open it again without restarting the host. Only a listening host's address is printed, and only the address goes to stdout, for copy
 * and paste. `--new` rotates the token in the running host first: the old address stops working at once and the new one is printed; with no host
 * running, the stored address is simply forgotten and the next start mints a fresh one.
 */
export async function openFrame(args: readonly string[], io: Io): Promise<number> {
  const fresh = args.includes('--new')
  const rest = args.filter((arg) => arg !== '--new')
  if (rest.length > 1) {
    io.stderr.write('usage: acrylblends open [dir] [--new]\n')
    return 2
  }
  const directory = resolve(io.cwd, rest[0] ?? '.')
  if (!existsSync(familyOf(directory))) {
    io.stderr.write(
      `no frame has run in ${directory}: it is not a frame app (it has no plugins/instance)\n`,
    )
    return 1
  }
  const found = await lookUpFrameUrl(directory)
  if (found.kind === 'none') {
    io.stderr.write(`no frame has run in ${directory} yet; start it with npm run dev\n`)
    return 1
  }
  if (!fresh) {
    if (found.kind === 'running') {
      io.stdout.write(`${found.record.url}\n`)
      return 0
    }
    io.stderr.write(
      `the frame of ${directory} is not running (its last address was minted ${found.record.writtenAt}); run npm run dev, then this command again\n`,
    )
    return 1
  }
  if (found.kind === 'stopped') {
    rmSync(frameUrlPath(frameHome(directory)), { force: true })
    io.stderr.write(
      `no frame is running in ${directory}; its stored address was forgotten and the next npm run dev mints a new one\n`,
    )
    return 0
  }
  const rotated = await rotateFrameToken(found.record)
  if ('reason' in rotated) {
    io.stderr.write(
      `the running frame did not rotate its address (${rotated.reason}); run npm run dev to start it with a fresh one\n`,
    )
    return 1
  }
  writeFrameUrl(frameHome(directory), rotated.url)
  io.stdout.write(`${rotated.url}\n`)
  return 0
}
