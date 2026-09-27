/**
 * One profile, one installation at a time (spec 036, "Many apps, no clashes").
 *
 * A Web or CLI profile links ACRYL's own packages into its `node_modules` from the installation that boots it. Two installations (the main checkout and a
 * worktree, a dev build and an installed app, two frameworks versions) booting the SAME profile silently re-point each other's links: the one that is
 * still running then serves the other's code. That is how a worktree run blanked a running main-branch app.
 *
 * So a profile records its owner (`<profile>/.acryl-owner.json`: installation root and pid). A different installation refuses to boot it while that owner
 * is alive, with a message that says which one holds it and how to run separately. A dead owner (stopped, crashed) is taken over; the same installation is
 * always allowed (a Web server and a CLI of one checkout can share a home). Per-app homes make the conflict rare; this makes it impossible to miss.
 *
 * @module acryl-harness-runtime/profile-owner
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROFILE_OWNER_FILE = '.acryl-owner.json'

export interface ProfileOwner {
  readonly installRoot: string
  readonly pid: number
  readonly since: string
}

export class ProfileInUseError extends Error {
  constructor(profileDir: string, owner: ProfileOwner, installRoot: string) {
    super(
      `ACRYL profile ${profileDir} is in use by another ACRYL installation (${owner.installRoot}, pid ${String(owner.pid)}). `
      + `This one (${installRoot}) would re-link its packages under the running app. Stop that app, or run this one in its own home `
      + '(set ACRYL_HOME, or start an app created with `acryl new` through its bin/acryl).',
    )
    this.name = 'ProfileInUseError'
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readOwner(file: string): ProfileOwner | undefined {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<ProfileOwner>
    return typeof value.installRoot === 'string' && Number.isInteger(value.pid) ? value as ProfileOwner : undefined
  } catch {
    return undefined
  }
}

function canonical(path: string): string {
  try { return realpathSync(path) } catch { return path }
}

/** Take the profile for this installation, or throw naming the live installation that holds it. */
export function claimProfile(profileDir: string, installRoot: string, pid: number = process.pid, alive: (pid: number) => boolean = isAlive): void {
  const root = canonical(installRoot)
  const file = join(profileDir, PROFILE_OWNER_FILE)
  const owner = existsSync(file) ? readOwner(file) : undefined
  if (owner !== undefined && canonical(owner.installRoot) !== root && owner.pid !== pid && alive(owner.pid)) throw new ProfileInUseError(profileDir, owner, root)
  writeFileSync(file, `${JSON.stringify({ installRoot: root, pid, since: new Date().toISOString() } satisfies ProfileOwner, null, 2)}\n`)
}
