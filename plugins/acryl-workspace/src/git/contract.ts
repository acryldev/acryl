/** Read-only git routes and view types shared by the ACRYL Workspace Host and Client. */

export const WORKSPACE_GIT_REPO_PATH = '/api/acryl-workspace/git/repo'
export const WORKSPACE_GIT_STATUS_PATH = '/api/acryl-workspace/git/status'
export const WORKSPACE_GIT_DIFF_PATH = '/api/acryl-workspace/git/diff'
export const WORKSPACE_GIT_WORKTREE_PATH = '/api/acryl-workspace/git/worktree'
export const WORKSPACE_GIT_CHECKS_PATH = '/api/acryl-workspace/git/checks'
export const WORKSPACE_GIT_STAGE_PATH = '/api/acryl-workspace/git/stage'
export const WORKSPACE_GIT_UNSTAGE_PATH = '/api/acryl-workspace/git/unstage'
export const WORKSPACE_GIT_COMMIT_PATH = '/api/acryl-workspace/git/commit'

/** The most files one stage or unstage request may name. */
export const MAX_STAGE_FILES = 1000
/** The longest commit message the commit route accepts. */
export const MAX_COMMIT_MESSAGE = 5000

/** One worktree of a repository, as `git worktree list` reports it. */
export interface GitWorktree {
  /** Absolute path of the worktree directory. */
  readonly path: string
  /** Checked-out branch name, or null when HEAD is detached or bare. */
  readonly branch: string | null
  /** Full commit id HEAD points at. */
  readonly head: string
  /** True for the repository's main worktree (git always lists it first). */
  readonly main: boolean
}

/** A repository and every worktree attached to it. */
export interface GitRepoView {
  /** Display name: the main worktree's directory name. */
  readonly name: string
  /** Absolute path of the main worktree. */
  readonly root: string
  /** Path of the worktree that contains the directory the request named. */
  readonly current: string
  readonly worktrees: readonly GitWorktree[]
}

/** Status letters shown next to a changed file. `?` is untracked, `U` is unmerged. */
export type GitChangeCode = 'M' | 'A' | 'D' | 'R' | 'U' | '?'

export interface GitChange {
  /** Path relative to the worktree root, forward slashes. */
  readonly path: string
  readonly code: GitChangeCode
  /** True when the index already holds a change for this path. */
  readonly staged: boolean
  /** Lines added versus HEAD, or null for binary and untracked files. */
  readonly added: number | null
  /** Lines removed versus HEAD, or null for binary and untracked files. */
  readonly removed: number | null
  /** Previous path for a rename. */
  readonly oldPath?: string
}

export interface GitStatusView {
  /** Worktree path this status describes. */
  readonly path: string
  /** Current branch, or null when detached. */
  readonly branch: string | null
  readonly changes: readonly GitChange[]
  /** True when the change list was cut at the entry cap. */
  readonly truncated: boolean
}

export interface GitDiffView {
  readonly path: string
  readonly file: string
  /** Unified diff text against HEAD; empty for binary files. */
  readonly text: string
  readonly binary: boolean
  /** True when the diff exceeded the output cap and was cut. */
  readonly truncated: boolean
}

/** The result of creating a branch and its worktree. */
export interface GitWorktreeCreatedView {
  /** Absolute path of the new worktree. */
  readonly path: string
  readonly branch: string
  /** The repository after the change, so the caller does not need a second request. */
  readonly repo: GitRepoView
}

export type CheckManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface CheckScript {
  /** A plain script name (letters, digits and `:_.-`), safe to type into a shell. */
  readonly name: string
  /** The script's command line, for display only. */
  readonly command: string
  /** True for check-like names (check, test, lint, typecheck, build, format, ...). */
  readonly primary: boolean
}

/** What a worktree can run: its package scripts and the package manager its lockfile names. */
export interface GitChecksView {
  readonly path: string
  /** The project's own manager, or null when no lockfile says (then `npm` is the neutral default). */
  readonly manager: CheckManager | null
  readonly scripts: readonly CheckScript[]
}

/** The result of a commit: the new commit and the worktree's status afterwards. */
export interface GitCommitView {
  /** Abbreviated hash of the new commit. */
  readonly hash: string
  /** First line of its message. */
  readonly subject: string
  readonly status: GitStatusView
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isWorktree(value: unknown): value is GitWorktree {
  return isRecord(value)
    && typeof value.path === 'string'
    && (value.branch === null || typeof value.branch === 'string')
    && typeof value.head === 'string'
    && typeof value.main === 'boolean'
}

/** @param value - unknown JSON from the repo route. */
export function parseGitRepoView(value: unknown): GitRepoView {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.root !== 'string'
    || typeof value.current !== 'string'
    || !Array.isArray(value.worktrees) || !value.worktrees.every(isWorktree)) {
    throw new Error('invalid git repo response')
  }
  return { name: value.name, root: value.root, current: value.current, worktrees: value.worktrees }
}

const CHANGE_CODES = new Set<string>(['M', 'A', 'D', 'R', 'U', '?'])

function isChange(value: unknown): value is GitChange {
  return isRecord(value)
    && typeof value.path === 'string'
    && typeof value.code === 'string' && CHANGE_CODES.has(value.code)
    && typeof value.staged === 'boolean'
    && (value.added === null || typeof value.added === 'number')
    && (value.removed === null || typeof value.removed === 'number')
    && (value.oldPath === undefined || typeof value.oldPath === 'string')
}

/** @param value - unknown JSON from the status route. */
export function parseGitStatusView(value: unknown): GitStatusView {
  if (!isRecord(value) || typeof value.path !== 'string'
    || (value.branch !== null && typeof value.branch !== 'string')
    || typeof value.truncated !== 'boolean'
    || !Array.isArray(value.changes) || !value.changes.every(isChange)) {
    throw new Error('invalid git status response')
  }
  return { path: value.path, branch: value.branch, changes: value.changes, truncated: value.truncated }
}

/** @param value - unknown JSON from the diff route. */
export function parseGitDiffView(value: unknown): GitDiffView {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.file !== 'string'
    || typeof value.text !== 'string' || typeof value.binary !== 'boolean'
    || typeof value.truncated !== 'boolean') {
    throw new Error('invalid git diff response')
  }
  return { path: value.path, file: value.file, text: value.text, binary: value.binary, truncated: value.truncated }
}

/** @param value - unknown JSON from the worktree route. */
export function parseGitWorktreeCreatedView(value: unknown): GitWorktreeCreatedView {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.branch !== 'string') {
    throw new Error('invalid git worktree response')
  }
  return { path: value.path, branch: value.branch, repo: parseGitRepoView(value.repo) }
}

const MANAGERS = new Set<string>(['pnpm', 'npm', 'yarn', 'bun'])
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,63}$/

function isCheckScript(value: unknown): value is CheckScript {
  return isRecord(value)
    && typeof value.name === 'string' && SAFE_NAME.test(value.name)
    && typeof value.command === 'string'
    && typeof value.primary === 'boolean'
}

/** @param value - unknown JSON from the checks route. */
export function parseGitChecksView(value: unknown): GitChecksView {
  if (!isRecord(value) || typeof value.path !== 'string'
    || (value.manager !== null && !(typeof value.manager === 'string' && MANAGERS.has(value.manager)))
    || !Array.isArray(value.scripts) || !value.scripts.every(isCheckScript)) {
    throw new Error('invalid git checks response')
  }
  return { path: value.path, manager: value.manager as CheckManager | null, scripts: value.scripts }
}

/** The command line to type for one script, using the project's own package manager. */
export function checkCommandLine(manager: CheckManager | null, script: string): string {
  if (!SAFE_NAME.test(script)) throw new Error('unsafe script name')
  return `${manager ?? 'npm'} run ${script}`
}

/** @param value - unknown JSON from the commit route. */
export function parseGitCommitView(value: unknown): GitCommitView {
  if (!isRecord(value) || typeof value.hash !== 'string' || typeof value.subject !== 'string') {
    throw new Error('invalid git commit response')
  }
  return { hash: value.hash, subject: value.subject, status: parseGitStatusView(value.status) }
}
