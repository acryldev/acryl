/**
 * One profile, one live installation (spec 036, "Self-containment"): a Protection Proxy in front of the one resource two installations can still point at.
 *
 * A Web or CLI profile links ACRYL's own packages into its `node_modules` from the installation that boots it. Two installations (a main checkout and a
 * worktree, a dev build and an installed app) booting the SAME profile silently re-point each other's links, and the one still running then serves the
 * other's code: that is how a worktree run blanked a running main-branch app. So every write to a profile goes through this guard, which holds the profile
 * with a Pessimistic Offline Lock (`instance/offline-lock.ts`): the same installation is always admitted, another is refused while the holder is alive,
 * and a stopped holder is taken over.
 *
 * @module acryl-harness-runtime/profile-owner
 */

import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { LockHeldError, acquireLock } from './instance/index.ts'

export const PROFILE_OWNER_FILE = '.acryl-owner.json'

export interface ProfileOwner {
  readonly installRoot: string
  readonly pid: number
  readonly since: string
}

export class ProfileInUseError extends Error {
  constructor(profileDir: string, owner: { installRoot: unknown, pid: number }, installRoot: string) {
    super(
      `ACRYL profile ${profileDir} is in use by another ACRYL installation (${String(owner.installRoot)}, pid ${String(owner.pid)}). `
      + `This one (${installRoot}) would re-link its packages under the running app. Stop that app, or run this one in its own home `
      + '(set ACRYL_HOME, or start an app created with `acryl new` through its bin/acryl).',
    )
    this.name = 'ProfileInUseError'
  }
}

function canonical(path: string): string {
  try { return realpathSync(path) } catch { return path }
}

/** Take the profile for this installation, or throw naming the live installation that holds it. */
export function claimProfile(profileDir: string, installRoot: string, pid: number = process.pid, alive?: (pid: number) => boolean): void {
  const root = canonical(installRoot)
  try {
    acquireLock(join(profileDir, PROFILE_OWNER_FILE), { pid, installRoot: root }, {
      ...(alive === undefined ? {} : { alive }),
      compatible: holder => typeof holder.installRoot === 'string' && canonical(holder.installRoot) === root,
    })
  } catch (error) {
    if (error instanceof LockHeldError) throw new ProfileInUseError(profileDir, { installRoot: error.holder.installRoot, pid: error.holder.pid }, root)
    throw error
  }
}
