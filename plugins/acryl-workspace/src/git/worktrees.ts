/** Repositories and their worktrees: listing them, confirming a path is one, and creating one. */

import { mkdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { GitRepoView, GitWorktreeCreatedView } from './contract.ts'
import { WorkspaceGitError } from './errors.ts'
import { assertBranchName } from './guards.ts'
import { parseWorktrees } from './parsing.ts'
import type { GitRunner } from './runner.ts'

/** Checking out a large repository can take far longer than a status call. */
const WORKTREE_ADD_TIMEOUT_MS = 120_000

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export class WorkspaceWorktrees {
  constructor(private readonly git: GitRunner) {}

  /**
   * List the repository's worktrees.
   * @param cwd - any directory inside the repository.
   * @returns the repository view, or null when `cwd` is not inside a git repository.
   */
  async repo(cwd: string): Promise<GitRepoView | null> {
    const dir = await this.git.resolveDirectory(cwd)
    let current: string
    try {
      current = (await this.git.run(['rev-parse', '--show-toplevel'], dir)).stdout.trim()
    } catch (cause) {
      if (cause instanceof WorkspaceGitError && cause.kind === 'not-repo') return null
      throw cause
    }
    const listed = await this.git.run(['worktree', 'list', '--porcelain'], dir)
    const worktrees = parseWorktrees(listed.stdout)
    const main = worktrees[0]
    if (main === undefined) throw new WorkspaceGitError('git listed no worktrees', 'failed')
    return { name: basename(main.path), root: main.path, current, worktrees }
  }

  /**
   * Confirm `path` is the root of a git worktree and return its real path. The file routes use this so
   * they only ever touch a checkout, never an arbitrary directory.
   * @throws WorkspaceGitError `invalid` when the path is not a worktree root.
   */
  async worktreeRoot(path: string): Promise<string> {
    const dir = await this.git.resolveDirectory(path)
    const top = (await this.git.run(['rev-parse', '--show-toplevel'], dir)).stdout.trim()
    let real: string
    try {
      real = await realpath(top)
    } catch {
      throw new WorkspaceGitError('path is not a git worktree', 'invalid')
    }
    if (real !== dir) throw new WorkspaceGitError('path is not the root of a git worktree', 'invalid')
    return dir
  }

  /**
   * Create a branch and a worktree for it in the repository's sibling `<repo>.worktrees/` folder,
   * which never dirties the repository. The branch starts at the main worktree's current commit.
   * @param cwd - any directory inside the repository.
   * @param branch - the new branch name.
   */
  async createWorktree(cwd: string, branch: string): Promise<GitWorktreeCreatedView> {
    assertBranchName(branch)
    const view = await this.repo(cwd)
    if (view === null) throw new WorkspaceGitError('not a git repository', 'not-repo')
    // Git has the last word on what a valid branch name is.
    try {
      await this.git.run(['check-ref-format', '--branch', branch], view.root)
    } catch {
      throw new WorkspaceGitError('that is not a valid branch name', 'invalid')
    }
    if ((await this.git.run(['branch', '--list', branch], view.root)).stdout.trim() !== '') {
      throw new WorkspaceGitError(`the branch ${branch} already exists`, 'conflict')
    }
    const parent = join(dirname(view.root), `${basename(view.root)}.worktrees`)
    const target = join(parent, branch.replace(/\//g, '-'))
    if (await pathExists(target)) throw new WorkspaceGitError('that worktree folder already exists', 'conflict')
    await mkdir(parent, { recursive: true })
    await this.git.run(['worktree', 'add', '-b', branch, target], view.root, undefined, WORKTREE_ADD_TIMEOUT_MS)
    const path = await realpath(target)
    const after = await this.repo(path)
    if (after === null) throw new WorkspaceGitError('the new worktree is not readable', 'failed')
    return { path, branch, repo: after }
  }
}
