/**
 * A development run from a git WORKTREE never touches the main checkout's app (spec 036, "Self-containment"). The rule itself is the runtime's instance
 * module (`worktreeInstance`); this adapter asks it which instance a launcher in `repoRoot` is, and returns that instance's environment contract when it is a
 * worktree. The main checkout, and anything the caller pinned explicitly (ACRYL_HOME, DSH_HOME), add nothing.
 */
import { instanceEnvironment, osHomeDirectory, selectInstance } from './instance-module.mjs'

export function checkoutIsolation(repoRoot, env = process.env, osHome = osHomeDirectory()) {
  const instance = selectInstance({ env, osHome, checkout: repoRoot })
  return instance.kind === 'worktree' ? instanceEnvironment(instance) : {}
}
