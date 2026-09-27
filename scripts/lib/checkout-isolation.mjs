/**
 * A development run from a git WORKTREE (a second checkout beside the main one) must never touch the main checkout's app: not its home (`~/.acryl`, where
 * the Web and CLI profiles link ACRYL's own packages into `node_modules`, so a worktree run re-points them and the main app starts serving the worktree's
 * code), not its port, not its Electron user data and single-instance lock. Found the hard way: a worktree Web boot re-linked the main Web profile.
 *
 * The rule is derived, not configured: the main working tree keeps the defaults; a worktree (its `.git` is a file) gets `~/.acryl-worktrees/<folder>`,
 * a Web port scan from 3081 and its own Electron app name. Anything the caller set explicitly (ACRYL_HOME, DSH_HOME, ACRYL_WEB_PORT) wins.
 */
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export const WORKTREE_HOMES_DIR_NAME = '.acryl-worktrees'
export const WORKTREE_WEB_PORT = '3081'

export function isGitWorktree(repoRoot) {
  const git = join(repoRoot, '.git')
  return existsSync(git) && statSync(git).isFile()
}

/** The environment additions for a development run from `repoRoot`. Empty for the main working tree. */
export function checkoutIsolation(repoRoot, env = process.env, home = homedir(), worktree = isGitWorktree(repoRoot)) {
  if (!worktree) return {}
  const name = basename(repoRoot).replace(/[^A-Za-z0-9._-]+/gu, '-')
  const pinnedHome = (env.ACRYL_HOME ?? '') !== '' || (env.DSH_HOME ?? '') !== ''
  return {
    ...(pinnedHome ? {} : { ACRYL_HOME: join(home, WORKTREE_HOMES_DIR_NAME, name) }),
    ...((env.ACRYL_WEB_PORT ?? '') !== '' ? {} : { ACRYL_WEB_PORT: WORKTREE_WEB_PORT }),
    ...((env.ACRYL_LOCAL_PRODUCT_NAME ?? '') !== '' ? {} : { ACRYL_LOCAL_PRODUCT_NAME: `ACRYL Development ${name}` }),
  }
}
