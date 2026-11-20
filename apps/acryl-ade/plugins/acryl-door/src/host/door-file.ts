/**
 * The door's connection file, `<app>/.acryl/door.json`: where the running app listens and this run's secret, for the operator client in
 * the same folder. The secret is never on a command line or in an environment variable another process can read.
 *
 * Protection: on macOS and Linux the folder is `0700` and the file `0600`, so only the OS user who started the app can read it. On
 * Windows file modes mean nothing; the file is protected by where it lives, the app folder in the user's profile, whose ACL gives access
 * to that user, SYSTEM and Administrators only. The door does not widen it. The folder also carries its own `.gitignore` of `*`, so
 * `git add -A` never stages the secret even in an app whose `.gitignore` lacks the `.acryl/` line.
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The folder of the door's state below the app folder. */
export const STATE_DIR = '.acryl'
export const DOOR_FILE = 'door.json'

export interface DoorFile {
  readonly version: 1
  /** The origin the operator reaches, on a loopback address. */
  readonly url: string
  readonly secret: string
  /** The process that wrote it; a file whose process is gone is stale. */
  readonly pid: number
}

export function stateDir(appRoot: string): string {
  return join(appRoot, STATE_DIR)
}

export function doorFilePath(appRoot: string): string {
  return join(stateDir(appRoot), DOOR_FILE)
}

/** A fresh secret for this run; a restart rotates it. */
export function newSecret(): string {
  return randomBytes(24).toString('hex')
}

/** The state folder, private, with its own `.gitignore`. */
export function ensureStateDir(appRoot: string): string {
  const dir = stateDir(appRoot)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(dir, 0o700)
  const ignore = join(dir, '.gitignore')
  if (!existsSync(ignore)) writeFileSync(ignore, '# The door\'s state: this run\'s secret and the audit. Never commit it.\n*\n')
  return dir
}

/** The connection file as written, or undefined when there is none or it does not parse. */
export function readDoorFile(appRoot: string): DoorFile | undefined {
  try {
    const value = JSON.parse(readFileSync(doorFilePath(appRoot), 'utf8')) as Partial<DoorFile>
    if (value.version === 1 && typeof value.url === 'string' && typeof value.secret === 'string' && typeof value.pid === 'number') return value as DoorFile
  } catch {
    // Missing or unreadable: there is no door to reach.
  }
  return undefined
}

/** True while the process is alive (a process of another user still counts: `EPERM`). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Write this run's connection file, replacing a stale one.
 * @throws when another live process already serves this folder's door: two apps from one folder would race for one file.
 */
/** @throws when another live process already serves this folder's door: two apps from one folder would race for one file. */
export function assertDoorIsFree(appRoot: string): void {
  const existing = readDoorFile(appRoot)
  if (existing !== undefined && existing.pid !== process.pid && alive(existing.pid)) {
    throw new Error(`acryl-door: another process (pid ${String(existing.pid)}) serves the door of ${appRoot}; stop it first`)
  }
}

export function writeDoorFile(appRoot: string, url: string, secret: string): string {
  const dir = ensureStateDir(appRoot)
  assertDoorIsFree(appRoot)
  const file = doorFilePath(appRoot)
  const temporary = join(dir, `${DOOR_FILE}.${String(process.pid)}.tmp`)
  const content: DoorFile = { version: 1, url, secret, pid: process.pid }
  writeFileSync(temporary, `${JSON.stringify(content)}\n`, { mode: 0o600 })
  if (process.platform !== 'win32') chmodSync(temporary, 0o600)
  renameSync(temporary, file)
  return file
}

/** Remove the connection file, only when it is this run's: a newer run's file is left alone. */
export function removeDoorFile(appRoot: string, secret: string): void {
  if (readDoorFile(appRoot)?.secret === secret) rmSync(doorFilePath(appRoot), { force: true })
}
