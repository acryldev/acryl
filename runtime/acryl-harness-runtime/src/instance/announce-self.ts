/**
 * A composition root's own claim and announcement (spec 048 T011). The process that serves an app takes the app's run lock and writes its Registry entry
 * once it knows the address it really listens on, and gives both back when it exits; `acryl control list` then finds every running app, whichever launcher
 * started it. A launcher that only spawns the app (scripts/blank.mjs, the dev runners) no longer holds the lock: the process that serves the app does, so a
 * stop signal reaches it directly and the port in the Registry is the bound one, not the one that was asked for.
 *
 * @module acryl-harness-runtime/instance/announce-self
 */

import type { AppInstance } from './app-instance.ts'
import { acquireLock, LockHeldError, releaseLock } from './offline-lock.ts'
import { announce, withdraw } from './registry.ts'
import { osHomeDirectory } from './select.ts'

/** What the running process tells the Registry about itself. */
export interface SelfAnnouncementInfo {
  /** The surface serving the app: `web`, `desktop` or `cli`. */
  readonly surface: string
  /** The port it is listening on, when the surface serves one. */
  readonly port?: number
  /** The announcing process; defaults to this one. */
  readonly pid?: number
  /** The OS user's home holding the Registry; defaults to the real one (the selector is the only reader of it). */
  readonly osHome?: string
  /** How to tell whether a holder is still alive; defaults to the process table. */
  readonly alive?: (pid: number) => boolean
}

/** The claim and announcement this process holds, and the one call that gives them back. */
export interface SelfAnnouncement {
  readonly id: string
  readonly port?: number
  /** Take the announcement and the lock back. Idempotent, and it never removes another process's claim. */
  release(): void
}

/** Refused because another live process already runs this app. */
export class InstanceAnnounceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstanceAnnounceError'
  }
}

function describeHolder(instance: AppInstance, holder: { readonly pid: number, readonly [key: string]: unknown }): string {
  const surface = typeof holder.surface === 'string' ? `, ${holder.surface}` : ''
  const port = typeof holder.port === 'number' ? `, port ${String(holder.port)}` : ''
  return `app "${instance.id}" is already running (pid ${String(holder.pid)}${surface}${port}). Stop it (node scripts/instances.mjs stop ${instance.id}) or start another app.`
}

/**
 * Claim `instance` for this process and announce it, with the real port. Throws {@link InstanceAnnounceError} when a different live process already holds
 * the app; a stale lock (its holder is gone) is taken over, as everywhere else in the instance module.
 */
export function announceSelf(instance: AppInstance, info: SelfAnnouncementInfo): SelfAnnouncement {
  const pid = info.pid ?? process.pid
  const osHome = info.osHome ?? osHomeDirectory()
  const entry = {
    id: instance.id,
    home: instance.home,
    pid,
    surface: info.surface,
    ...(info.port === undefined ? {} : { port: info.port }),
  }
  try {
    acquireLock(instance.runLockFile, entry, {
      ...(info.alive === undefined ? {} : { alive: info.alive }),
      // This process re-announcing (an engine swap under one root) keeps its own claim; any other live process is refused.
      compatible: current => current.pid === pid,
      describe: current => describeHolder(instance, current),
    })
  } catch (error) {
    if (error instanceof LockHeldError) throw new InstanceAnnounceError(error.message)
    throw error
  }
  announce(osHome, instance, entry)
  let released = false
  return Object.freeze({
    id: instance.id,
    ...(info.port === undefined ? {} : { port: info.port }),
    release(): void {
      if (released) return
      released = true
      withdraw(osHome, instance, pid)
      releaseLock(instance.runLockFile, pid)
    },
  })
}
