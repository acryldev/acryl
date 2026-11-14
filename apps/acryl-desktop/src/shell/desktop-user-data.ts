/** Electron user-data location: an explicit override, else the selected app instance's own folder inside its home. */

import { cpSync, existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** Env var consumed by the Electron bootstrap before the single-instance lock. */
export const DSH_DESKTOP_USER_DATA_ENV = 'DSH_DESKTOP_USER_DATA'

/** What the selected app instance says about where its Electron user data lives (see `AppInstance.userDataDir`). */
export interface InstanceUserData {
  /** The instance's user-data folder, inside its home. */
  readonly userDataDir: string
}

/**
 * Resolve the user-data directory for this launch.
 * An explicit `DSH_DESKTOP_USER_DATA` wins; empty or whitespace-only values are treated as unset so a blank override never points Electron at the
 * current working directory. Otherwise it is the instance's own folder inside its home (`~/.acryl/desktop-data` for the installed app), so two apps never
 * share window state, logs, crash evidence or the single-instance lock, and nothing lands in an OS application-data folder.
 * @param env - process environment, injected in tests.
 * @param instance - the selected instance's user-data facts.
 */
export function resolveDesktopUserData(env: Record<string, string | undefined>, instance: InstanceUserData): string {
  const raw = env[DSH_DESKTOP_USER_DATA_ENV]
  if (raw !== undefined && raw.trim().length > 0) return resolve(raw)
  return instance.userDataDir
}

/** Chromium's per-folder process locks: never carried over, or the new folder would look held by the old app. */
const PROCESS_LOCKS = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'])

/**
 * Carry the user data an earlier version kept in the OS application-data folder (`<appData>/<userDataName>`) into the home, once: only when the new folder
 * does not exist yet. It is copied, not moved, so an older ACRYL still installed keeps working.
 * @returns the folder it copied from, or undefined when there was nothing to carry.
 */
export function carryLegacyUserData(target: string, legacy: string | undefined): string | undefined {
  if (legacy === undefined || existsSync(target) || !existsSync(legacy)) return undefined
  cpSync(legacy, target, { recursive: true, filter: source => !PROCESS_LOCKS.has(basename(source)) })
  return legacy
}

/** The folder an earlier version used: Electron's application-data root plus the instance's user-data name. */
export function legacyUserDataDirectory(appData: string, userDataName: string): string {
  return join(appData, userDataName)
}
