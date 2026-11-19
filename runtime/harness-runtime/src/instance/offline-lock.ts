/**
 * Pessimistic Offline Lock (Patterns of Enterprise Application Architecture), with the book's conditions met: ownership is visible (the file says who
 * holds it), and a stale lock (its holder's process is gone) is taken over instead of blocking forever. Used for "one live process per app" and "one live
 * installation per profile".
 *
 * @module acryl-harness-runtime/instance/offline-lock
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface LockHolder {
  readonly pid: number
  readonly since: string
  readonly [detail: string]: unknown
}

export class LockHeldError extends Error {
  readonly holder: LockHolder
  constructor(message: string, holder: LockHolder) {
    super(message)
    this.name = 'LockHeldError'
    this.holder = holder
  }
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function readLock(file: string): LockHolder | undefined {
  if (!existsSync(file)) return undefined
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockHolder>
    return Number.isInteger(value.pid) ? value as LockHolder : undefined
  } catch {
    return undefined
  }
}

/**
 * Take the lock for `pid`. Refused (LockHeldError, with a message built by `describe`) when a live holder exists that `compatible` does not accept.
 * `compatible` lets a lock admit its own kind (the same installation, the same process).
 */
export function acquireLock(
  file: string,
  holder: Omit<LockHolder, 'since'>,
  options: {
    readonly alive?: (pid: number) => boolean
    readonly compatible?: (current: LockHolder) => boolean
    readonly describe?: (current: LockHolder) => string
  } = {},
): void {
  const alive = options.alive ?? processIsAlive
  const current = readLock(file)
  if (current !== undefined && current.pid !== holder.pid && alive(current.pid) && options.compatible?.(current) !== true) {
    throw new LockHeldError(options.describe?.(current) ?? `${file} is held by pid ${String(current.pid)}`, current)
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify({ ...holder, since: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
}

/** Release only our own hold: never remove a lock a newer holder took after ours went stale. */
export function releaseLock(file: string, pid: number = process.pid): void {
  if (readLock(file)?.pid === pid) rmSync(file, { force: true })
}
