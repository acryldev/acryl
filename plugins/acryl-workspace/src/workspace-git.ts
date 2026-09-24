/**
 * Read-only git access for the ACRYL Workspace: worktrees, status and diff.
 *
 * Every call runs `git` through `execFile` with an argument array (no shell), a timeout and an
 * output cap. Nothing here mutates a repository. Set `GIT_OPTIONAL_LOCKS=0` so a status poll never
 * takes the index lock an agent's own `git` call may need.
 */

import { execFile } from 'node:child_process'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type {
  GitChange,
  GitChangeCode,
  GitDiffView,
  GitRepoView,
  GitStatusView,
  GitWorktree,
  GitWorktreeCreatedView,
} from './workspace-git-contract.ts'

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_CHANGES = 1000

const GLOBAL_ARGS = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false'] as const

export interface WorkspaceGitOptions {
  /** Executable to run. Defaults to `git`. */
  readonly gitPath?: string
  /** Output cap per command; longer output is cut and flagged. */
  readonly maxOutputBytes?: number
  readonly timeoutMs?: number
  /** Cap on entries returned by `status`. */
  readonly maxChanges?: number
}

/**
 * A request the caller got wrong (400), a directory that is not a repository (404), something that
 * already exists (409), or a git failure (500).
 */
export class WorkspaceGitError extends Error {
  constructor(message: string, readonly kind: 'invalid' | 'not-repo' | 'conflict' | 'failed') {
    super(message)
    this.name = 'WorkspaceGitError'
  }
}

interface RunResult {
  readonly stdout: string
  readonly truncated: boolean
}

interface Inflight {
  readonly abort: () => void
  readonly done: Promise<void>
}

/** Read-only git service. Dispose it to abort and reap every in-flight `git` process. */
export class WorkspaceGit {
  private readonly gitPath: string
  private readonly maxOutputBytes: number
  private readonly timeoutMs: number
  private readonly maxChanges: number
  private readonly inflight = new Set<Inflight>()
  private disposed = false

  constructor(options: WorkspaceGitOptions = {}) {
    this.gitPath = options.gitPath ?? 'git'
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxChanges = options.maxChanges ?? DEFAULT_MAX_CHANGES
  }

  /**
   * List the repository's worktrees.
   * @param cwd - any directory inside the repository.
   * @returns the repository view, or null when `cwd` is not inside a git repository.
   */
  async repo(cwd: string): Promise<GitRepoView | null> {
    const dir = await this.resolveDirectory(cwd)
    let current: string
    try {
      current = (await this.run(['rev-parse', '--show-toplevel'], dir)).stdout.trim()
    } catch (cause) {
      if (cause instanceof WorkspaceGitError && cause.kind === 'not-repo') return null
      throw cause
    }
    const listed = await this.run(['worktree', 'list', '--porcelain'], dir)
    const worktrees = parseWorktrees(listed.stdout)
    const main = worktrees[0]
    if (main === undefined) throw new WorkspaceGitError('git listed no worktrees', 'failed')
    return { name: basename(main.path), root: main.path, current, worktrees }
  }

  /**
   * Changed files in one worktree, versus HEAD.
   * @param path - absolute worktree directory.
   */
  async status(path: string): Promise<GitStatusView> {
    const dir = await this.resolveDirectory(path)
    const [porcelain, numstat, branch] = await Promise.all([
      this.run(['status', '--porcelain=v1', '-z', '--untracked-files=all'], dir),
      this.run(['diff', '--numstat', '-z', 'HEAD', '--'], dir).catch(emptyResult),
      this.run(['branch', '--show-current'], dir).catch(emptyResult),
    ])
    const counts = parseNumstat(numstat.stdout)
    const all = parsePorcelain(porcelain.stdout, counts)
    const truncated = porcelain.truncated || all.length > this.maxChanges
    const name = branch.stdout.trim()
    return {
      path: dir,
      branch: name === '' ? null : name,
      changes: all.slice(0, this.maxChanges),
      truncated,
    }
  }

  /**
   * Unified diff of one file against HEAD (untracked files diff against nothing).
   * @param path - absolute worktree directory.
   * @param file - path relative to that worktree.
   */
  async diff(path: string, file: string): Promise<GitDiffView> {
    const dir = await this.resolveDirectory(path)
    assertRelativeFile(file)
    const untracked = (await this.run(['ls-files', '--others', '--exclude-standard', '-z', '--', file], dir)).stdout.length > 0
    const flags = ['--no-color', '--no-ext-diff', '--no-textconv'] as const
    let result: RunResult
    if (untracked) {
      // `git diff --no-index` exits 1 when the files differ, which is the normal case here.
      result = await this.run(['diff', '--no-index', ...flags, '--', '/dev/null', file], dir, 1)
    } else {
      try {
        result = await this.run(['diff', ...flags, 'HEAD', '--', file], dir)
      } catch (cause) {
        // A repository with no commits has no HEAD; fall back to the index against the empty tree.
        if (!(cause instanceof WorkspaceGitError) || cause.kind !== 'failed') throw cause
        result = await this.run(['diff', '--cached', ...flags, '--', file], dir)
      }
    }
    const binary = /^Binary files .* differ$/m.test(result.stdout) || result.stdout.includes('GIT binary patch')
    return { path: dir, file, text: binary ? '' : result.stdout, binary, truncated: result.truncated }
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
      await this.run(['check-ref-format', '--branch', branch], view.root)
    } catch {
      throw new WorkspaceGitError('that is not a valid branch name', 'invalid')
    }
    if ((await this.run(['branch', '--list', branch], view.root)).stdout.trim() !== '') {
      throw new WorkspaceGitError(`the branch ${branch} already exists`, 'conflict')
    }
    const parent = join(dirname(view.root), `${basename(view.root)}.worktrees`)
    const target = join(parent, branch.replace(/\//g, '-'))
    if (await pathExists(target)) throw new WorkspaceGitError('that worktree folder already exists', 'conflict')
    await mkdir(parent, { recursive: true })
    await this.run(['worktree', 'add', '-b', branch, target], view.root, undefined, WORKTREE_ADD_TIMEOUT_MS)
    const path = await realpath(target)
    const after = await this.repo(path)
    if (after === null) throw new WorkspaceGitError('the new worktree is not readable', 'failed')
    return { path, branch, repo: after }
  }

  /** Abort every in-flight `git` process and wait for each to exit. Later calls reject. */
  async dispose(): Promise<void> {
    this.disposed = true
    const pending = [...this.inflight]
    for (const entry of pending) entry.abort()
    await Promise.all(pending.map(entry => entry.done))
  }

  private async resolveDirectory(path: string): Promise<string> {
    if (typeof path !== 'string' || path.length === 0 || path.includes('\0') || !isAbsolute(path)) {
      throw new WorkspaceGitError('path must be an absolute directory', 'invalid')
    }
    let real: string
    try {
      real = await realpath(path)
      if (!(await stat(real)).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new WorkspaceGitError('path is not an existing directory', 'invalid')
    }
    return real
  }

  private run(args: readonly string[], cwd: string, acceptExit?: number, timeoutMs?: number): Promise<RunResult> {
    if (this.disposed) return Promise.reject(new WorkspaceGitError('git service is disposed', 'failed'))
    const controller = new AbortController()
    let settle!: () => void
    const done = new Promise<void>((resolve) => { settle = resolve })
    const entry: Inflight = { abort: () => { controller.abort() }, done }
    this.inflight.add(entry)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      LC_ALL: 'C',
    }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    delete env.GIT_INDEX_FILE
    return new Promise<RunResult>((resolve, reject) => {
      const child = execFile(
        this.gitPath,
        [...GLOBAL_ARGS, ...args],
        {
          cwd,
          env,
          encoding: 'utf8',
          maxBuffer: this.maxOutputBytes,
          timeout: timeoutMs ?? this.timeoutMs,
          signal: controller.signal,
        },
        (failure, stdout, stderr) => {
          if (failure === null) {
            resolve({ stdout, truncated: false })
            return
          }
          const info = failure as NodeJS.ErrnoException & { stdout?: string }
          if (info.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            resolve({ stdout: info.stdout ?? stdout, truncated: true })
            return
          }
          if (typeof info.code === 'number' && info.code === acceptExit) {
            resolve({ stdout, truncated: false })
            return
          }
          if (/not a git repository/i.test(stderr)) {
            reject(new WorkspaceGitError('not a git repository', 'not-repo'))
            return
          }
          reject(new WorkspaceGitError(`git ${args[0] ?? ''} failed`, 'failed'))
        },
      )
      // execFile's callback fires as soon as an abort is requested, before the process has exited.
      // Only the child's `close` (or a spawn `error`) proves it is gone, so that is what disposal awaits.
      const finished = (): void => {
        this.inflight.delete(entry)
        settle()
      }
      child.once('close', finished)
      child.once('error', finished)
    })
  }
}

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

/**
 * A conservative first filter, before git's own check: letters, digits, `.`, `_`, `-` and `/`
 * separators, starting with a letter, digit or underscore. It keeps the branch usable as one folder
 * name and can never look like an option or a path escape.
 */
function assertBranchName(branch: string): void {
  if (typeof branch !== 'string' || branch.length === 0 || branch.length > 200
    || !/^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(branch)
    || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) {
    throw new WorkspaceGitError('branch names use letters, digits, ".", "_", "-" and "/", and start with a letter, digit or "_"', 'invalid')
  }
}

function emptyResult(): RunResult {
  return { stdout: '', truncated: false }
}

function assertRelativeFile(file: string): void {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || file.includes('\0')
    || file.startsWith('/') || file.startsWith('-') || /(^|[\\/])\.\.([\\/]|$)/.test(file)) {
    throw new WorkspaceGitError('file must be a relative path inside the worktree', 'invalid')
  }
}

/** Parse `git worktree list --porcelain`. Git always lists the main worktree first. */
export function parseWorktrees(text: string): GitWorktree[] {
  const worktrees: GitWorktree[] = []
  for (const block of text.split(/\n\n+/)) {
    let path: string | undefined
    let head = ''
    let branch: string | null = null
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
    if (path !== undefined) worktrees.push({ path, head, branch, main: worktrees.length === 0 })
  }
  return worktrees
}

interface LineCount {
  readonly added: number | null
  readonly removed: number | null
}

/** Parse `git diff --numstat -z`. Binary files report `-` and map to null counts. */
export function parseNumstat(text: string): Map<string, LineCount> {
  const counts = new Map<string, LineCount>()
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '') continue
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token)
    if (match === null) continue
    let path = match[3] ?? ''
    // A rename carries an empty path here, then the old and new paths as the next two tokens.
    if (path === '') {
      path = tokens[index + 2] ?? ''
      index += 2
    }
    counts.set(path, {
      added: match[1] === '-' ? null : Number(match[1]),
      removed: match[2] === '-' ? null : Number(match[2]),
    })
  }
  return counts
}

function classify(x: string, y: string): { code: GitChangeCode; staged: boolean } {
  if (x === '?' && y === '?') return { code: '?', staged: false }
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return { code: 'U', staged: false }
  }
  const staged = x !== ' '
  let code: string
  if (x === 'A' || x === 'C') code = 'A'
  else if (x === 'R') code = 'R'
  else code = y !== ' ' ? y : x
  if (code === 'T') code = 'M'
  return { code: (['M', 'A', 'D', 'R'].includes(code) ? code : 'M') as GitChangeCode, staged }
}

/** Parse `git status --porcelain=v1 -z`, attaching line counts where git reported them. */
export function parsePorcelain(text: string, counts: ReadonlyMap<string, LineCount>): GitChange[] {
  const changes: GitChange[] = []
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token.length < 4) continue
    const x = token[0] ?? ' '
    const y = token[1] ?? ' '
    if (x === '!' && y === '!') continue
    const path = token.slice(3)
    let oldPath: string | undefined
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      oldPath = tokens[index + 1]
      index += 1
    }
    const { code, staged } = classify(x, y)
    const count = counts.get(path)
    changes.push({
      path,
      code,
      staged,
      added: count?.added ?? null,
      removed: count?.removed ?? null,
      ...(oldPath === undefined ? {} : { oldPath }),
    })
  }
  return changes
}
