/** Optional Electron user-data override for isolated local launches. */

import { resolve } from 'node:path'

/** Env var consumed by the Electron bootstrap before the single-instance lock. */
export const DSH_DESKTOP_USER_DATA_ENV = 'DSH_DESKTOP_USER_DATA'

/**
 * Resolve a launch-time user-data directory from the environment.
 * Empty or whitespace-only values are treated as unset so a blank override
 * never points Electron at the current working directory.
 * @param env - process environment, injected in tests.
 */
export function resolveDesktopUserDataOverride(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env[DSH_DESKTOP_USER_DATA_ENV]
  if (raw === undefined || raw.trim().length === 0) return undefined
  return resolve(raw)
}
