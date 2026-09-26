/**
 * The Workspace's git access, as one facade over focused modules.
 *
 * Each use case lives in its own module and reaches git only through the confined {@link GitRunner}
 * (argument arrays, timeouts, output caps, no shell):
 * - `worktrees.ts` repositories and worktrees
 * - `changes.ts` status, diff, stage, unstage
 * - `commits.ts` commit (never pushes)
 * - `search.ts` repo-wide search
 * - `checks.ts` package scripts a worktree can run
 * The facade exists so the routes and the file routes keep one collaborator to depend on.
 */

import type {
  GitChecksView,
  GitCommitView,
  GitDiffView,
  GitRepoView,
  GitSearchMode,
  GitSearchView,
  GitStatusView,
  GitWorktreeCreatedView,
} from './contract.ts'
import { WorkspaceChanges } from './changes.ts'
import { readWorktreeChecks } from './checks.ts'
import { WorkspaceCommits } from './commits.ts'
import { GitRunner, type GitRunnerOptions } from './runner.ts'
import { WorkspaceSearch } from './search.ts'
import { WorkspaceWorktrees } from './worktrees.ts'

export { WorkspaceGitError } from './errors.ts'
export { parseNumstat, parsePorcelain, parseWorktrees } from './parsing.ts'

const DEFAULT_MAX_CHANGES = 1000

export interface WorkspaceGitOptions extends GitRunnerOptions {
  /** Cap on entries returned by `status`. */
  readonly maxChanges?: number
}

export class WorkspaceGit {
  private readonly runner: GitRunner
  private readonly worktrees: WorkspaceWorktrees
  private readonly changes: WorkspaceChanges
  private readonly commits: WorkspaceCommits
  private readonly searcher: WorkspaceSearch

  constructor(options: WorkspaceGitOptions = {}) {
    this.runner = new GitRunner(options)
    this.worktrees = new WorkspaceWorktrees(this.runner)
    this.changes = new WorkspaceChanges(this.runner, options.maxChanges ?? DEFAULT_MAX_CHANGES)
    this.commits = new WorkspaceCommits(this.runner, this.changes)
    this.searcher = new WorkspaceSearch(this.runner)
  }

  /** The repository containing `cwd`, or null when it is not inside a git repository. */
  repo(cwd: string): Promise<GitRepoView | null> { return this.worktrees.repo(cwd) }

  /** Confirm `path` is the root of a git worktree and return its real path. */
  worktreeRoot(path: string): Promise<string> { return this.worktrees.worktreeRoot(path) }

  /** Create a branch and a worktree for it in the repository's sibling `<repo>.worktrees/` folder. */
  createWorktree(cwd: string, branch: string): Promise<GitWorktreeCreatedView> { return this.worktrees.createWorktree(cwd, branch) }

  /** Changed files in one worktree, versus HEAD. */
  status(path: string): Promise<GitStatusView> { return this.changes.status(path) }

  /** Unified diff of one file against HEAD (untracked files diff against nothing). */
  diff(path: string, file: string): Promise<GitDiffView> { return this.changes.diff(path, file) }

  /** Stage files, then report the worktree's status. */
  stage(path: string, files: readonly string[]): Promise<GitStatusView> { return this.changes.stage(path, files) }

  /** Unstage files, keeping their working-tree changes, then report the status. */
  unstage(path: string, files: readonly string[]): Promise<GitStatusView> { return this.changes.unstage(path, files) }

  /** Commit what is staged; never pushes. */
  commit(path: string, message: string): Promise<GitCommitView> { return this.commits.commit(path, message) }

  /** Find files by name, or lines by content, literally and case-insensitively. */
  search(path: string, query: string, mode: GitSearchMode): Promise<GitSearchView> { return this.searcher.search(path, query, mode) }

  /** The scripts a worktree can run as checks, and its package manager. */
  async checks(path: string): Promise<GitChecksView> {
    return readWorktreeChecks(await this.runner.resolveDirectory(path))
  }

  /** Abort every in-flight `git` process and wait for each to exit. Later calls reject. */
  dispose(): Promise<void> { return this.runner.dispose() }
}
