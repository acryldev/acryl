/** Which entries of one directory git ignores, for the file tree to show them dimmed. */

import type { GitRunner } from './runner.ts'

/**
 * @param git - the runner.
 * @param root - absolute worktree root (its real path).
 * @param paths - entries relative to the root, `/`-separated; a directory ends in `/`, so directory-only patterns (`build/`) apply.
 * @returns the given paths git ignores; none when git cannot answer (the tree then shows everything undimmed).
 */
export async function ignoredPaths(git: GitRunner, root: string, paths: readonly string[]): Promise<ReadonlySet<string>> {
  if (paths.length === 0) return new Set()
  try {
    // Exit 1 means none of them is ignored. One path per line (`-z` needs `--stdin`, which the runner has no input for); a name git still
    // quotes (a newline or a quote in it) does not match and is shown undimmed.
    const result = await git.run(['-c', 'core.quotePath=false', 'check-ignore', '--', ...paths], root, 1)
    return new Set(result.stdout.split('\n').filter(path => path !== ''))
  } catch {
    return new Set()
  }
}
