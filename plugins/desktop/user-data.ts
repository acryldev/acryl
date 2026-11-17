/** Electron user-data location for isolated local launches: an explicit override, else the selected app instance's own folder. */

import { join, resolve } from 'node:path'

/** Env var consumed by the Electron bootstrap before the single-instance lock. */
export const DSH_DESKTOP_USER_DATA_ENV = 'DSH_DESKTOP_USER_DATA'

/** What the selected app instance says about where its Electron user data lives (see `AppInstance.userDataName`). */
export interface InstanceUserData {
  /**
   * The platform's application-data folder (`app.getPath('appData')`). A function because it is asked only when it is needed: Electron throws for it on
   * Windows when the user profile is redirected (an isolated run moves USERPROFILE), and an explicit `DSH_DESKTOP_USER_DATA` makes it unnecessary.
   */
  readonly appData: () => string
  /** The instance's user-data folder name. */
  readonly userDataName: string
  /** The name Electron would otherwise derive the folder from. */
  readonly productName: string
}

/**
 * Resolve a launch-time user-data directory from the environment.
 * An explicit `DSH_DESKTOP_USER_DATA` wins; empty or whitespace-only values are treated as unset so a blank override never points Electron at the
 * current working directory. Without one, an instance whose `userDataName` differs from the product name (a worktree, the development app, a launch
 * with `ACRYL_LOCAL_PRODUCT_NAME`) gets its own folder under the application-data folder, so it never shares window state, logs, crash evidence or
 * the single-instance lock with the installed app. The default instance names its folder after the product, so it is left alone.
 * @param env - process environment, injected in tests.
 * @param instance - the selected instance's user-data facts, when the caller has them.
 */
export function resolveDesktopUserDataOverride(
  env: Record<string, string | undefined> = process.env,
  instance?: InstanceUserData,
): string | undefined {
  const raw = env[DSH_DESKTOP_USER_DATA_ENV]
  if (raw !== undefined && raw.trim().length > 0) return resolve(raw)
  if (instance === undefined || instance.userDataName === instance.productName) return undefined
  return join(instance.appData(), instance.userDataName)
}
