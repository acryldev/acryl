/**
 * One process per data folder. PGlite does not lock its folder, and two processes (or two opens in one process) writing the same
 * Postgres cluster corrupt it, so the provider holds a lock file next to it: created exclusively with the holder's pid, replaced when that
 * process is gone, and removed on close only while it is still this holder's.
 */

import { openSync, readFileSync, rmSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** The lock file's name, beside the cluster's files in the data folder. */
export const LOCK_FILE = 'acryl-db-pglite.lock'

interface Holder {
  readonly pid: number
  readonly token: string
}

function readHolder(file: string): Holder | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof value === 'object' && value !== null && typeof (value as Holder).pid === 'number' && typeof (value as Holder).token === 'string') return value as Holder
  } catch {
    // Missing, or half written by a holder that died while writing it: no live holder.
  }
  return undefined
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** A held lock. */
export interface FolderLock {
  release(): void
}

/**
 * Take the folder's lock.
 * @throws when a live process holds it, this one included (the folder is already open here).
 */
export function lockFolder(folder: string): FolderLock {
  const file = join(folder, LOCK_FILE)
  const holder: Holder = { pid: process.pid, token: randomUUID() }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd: number
    try {
      fd = openSync(file, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const current = readHolder(file)
      if (current !== undefined && isAlive(current.pid)) {
        throw new Error(`acryl-db-pglite: ${folder} is already open in ${current.pid === process.pid ? 'this process' : `process ${String(current.pid)}`}; one process at a time may open a PGlite data folder`)
      }
      // A holder that is gone: take its place.
      rmSync(file, { force: true })
      continue
    }
    try {
      writeSync(fd, JSON.stringify(holder))
    } finally {
      closeSync(fd)
    }
    return {
      release: () => {
        if (readHolder(file)?.token === holder.token) rmSync(file, { force: true })
      },
    }
  }
  throw new Error(`acryl-db-pglite: could not lock ${folder}; another process took the lock at the same moment`)
}
