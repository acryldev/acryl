/**
 * Versions: the branch's commits as save points.
 *
 * - A version is a commit; the log is `git log`, newest first.
 * - Save stages everything (`git add -A`) and commits it.
 * - Restore brings a version's tree back with `git checkout <hash> -- .` and records it as a new commit
 *   ("Restore <short>"); history is never rewritten and a dirty worktree is refused.
 * - Share is an explicit, non-force `git push` to the branch's existing upstream, and only of a plan the person confirmed: `planShare` says what
 *   would be sent without sending anything, and `share` plans again and sends nothing when that changed.
 */

import {
  DEFAULT_LOG_LIMIT,
  MAX_COMMIT_MESSAGE,
  MAX_LOG_LIMIT,
  VERSION_HASH_PATTERN,
  type VersionsCommitView,
  type VersionsEntry,
  type VersionsLogView,
  type VersionsRestoreView,
  type VersionsSaveView,
  type VersionsSharePlan,
  type VersionsShareView,
  remoteAddress,
  sameSharePlan,
} from './contract.ts'
import { VersionsGitError } from './git/errors.ts'
import type { GitRunner } from './git/runner.ts'

const COMMIT_TIMEOUT_MS = 120_000
const WRITE_TIMEOUT_MS = 120_000
const RESTORE_TIMEOUT_MS = 120_000
const PUSH_TIMEOUT_MS = 120_000
/** `%H` full id, `%h` short id, `%an` author, `%at` author time, `%s` subject, NUL-separated so no field can bleed into another. */
const ENTRY_FORMAT = '%H%x00%h%x00%an%x00%at%x00%s'

function clampLimit(limit: number): number {
  if (!Number.isInteger(limit)) return DEFAULT_LOG_LIMIT
  return Math.min(MAX_LOG_LIMIT, Math.max(1, limit))
}

function commitView(entry: VersionsEntry): VersionsCommitView {
  return { hash: entry.hash, short: entry.short, subject: entry.subject }
}

/** Parse one `git log` page; a line git could not have produced is a failure, not a silent skip. */
export function parseVersionsEntries(stdout: string): VersionsEntry[] {
  const entries: VersionsEntry[] = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const fields = line.split('\0')
    if (fields.length !== 5) throw new VersionsGitError('git log returned an unexpected line', 'failed')
    const [hash, short, author, seconds, subject] = fields as [string, string, string, string, string]
    const at = new Date(Number(seconds) * 1000)
    if (!/^[0-9a-f]{40}$/.test(hash) || short === '' || !/^\d+$/.test(seconds) || Number.isNaN(at.getTime())) {
      throw new VersionsGitError('git log returned an unexpected line', 'failed')
    }
    entries.push({ hash, short, author, at: at.toISOString(), subject })
  }
  return entries
}

/**
 * Every call's result once all of them have finished, or the first failure then: unlike `Promise.all`, a request never answers while one of its git
 * processes still runs in the folder (Windows cannot remove a folder a process runs in, and the caller may remove it right after the answer).
 */
async function allFinished<T extends readonly unknown[] | []>(calls: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const settled = await Promise.allSettled(calls)
  for (const result of settled) if (result.status === 'rejected') throw result.reason
  return settled.map(result => (result as PromiseFulfilledResult<unknown>).value) as { -readonly [P in keyof T]: Awaited<T[P]> }
}

export class Versions {
  constructor(private readonly git: GitRunner) {}

  /** The branch's versions, newest first, with its upstream and how far the two have diverged. */
  async log(path: string, limit: number = DEFAULT_LOG_LIMIT): Promise<VersionsLogView> {
    const dir = await this.git.resolveDirectory(path)
    const [branchResult, upstream, logResult] = await allFinished([
      // On an unborn branch `rev-parse HEAD` fails; the branch name still exists, named by HEAD's symref.
      this.git.run(['rev-parse', '--abbrev-ref', 'HEAD'], dir, 128),
      this.upstreamOf(dir),
      // An unborn branch has no commits yet: that is an empty log, not a failed request.
      this.git.run(['log', `--format=${ENTRY_FORMAT}`, '-n', String(clampLimit(limit))], dir, 128),
    ])
    // `rev-parse` prints "HEAD" both for a detached HEAD and for an unborn branch (and fails on the latter);
    // HEAD's symref names the branch only in the unborn case, and fails on a detached one.
    let branch = branchResult.stdout.trim()
    if (branch === '' || branch === 'HEAD') {
      const symbolic = (await this.git.run(['symbolic-ref', '--short', 'HEAD'], dir, 128)).stdout.trim()
      branch = symbolic === '' ? 'HEAD' : symbolic
    }
    const [ahead, behind] = upstream === null ? [0, 0] : await this.divergence(dir)
    return {
      path: dir,
      branch: branch === '' || branch === 'HEAD' ? null : branch,
      upstream,
      ahead,
      behind,
      entries: parseVersionsEntries(logResult.stdout),
    }
  }

  /** Stage every change and commit it; refuse an unusable message, an empty stage and a missing identity. */
  async save(path: string, message: string): Promise<VersionsSaveView> {
    const dir = await this.git.resolveDirectory(path)
    const text = typeof message === 'string' ? message.trim() : ''
    if (text === '' || text.length > MAX_COMMIT_MESSAGE || text.includes('\0')) {
      throw new VersionsGitError('write a commit message (up to 5000 characters)', 'invalid')
    }
    await this.git.run(['add', '-A'], dir, undefined, WRITE_TIMEOUT_MS)
    await this.commitStaged(dir, text)
    const entry = await this.headEntry(dir)
    return { entry, commit: commitView(entry) }
  }

  /**
   * Bring a version's tree back as a new commit; never rewrite history and never touch a dirty worktree. The tree is the version's exactly: a file
   * added after it is removed too. The commit is called `message`, else `Restore <short id>`.
   */
  async restore(path: string, hash: string, message?: string): Promise<VersionsRestoreView> {
    const dir = await this.git.resolveDirectory(path)
    const requested = typeof hash === 'string' ? hash.trim().toLowerCase() : ''
    const text = message === undefined ? undefined : message.trim()
    if (text !== undefined && (text === '' || text.length > MAX_COMMIT_MESSAGE || text.includes('\0'))) {
      throw new VersionsGitError('write a commit message (up to 5000 characters)', 'invalid')
    }
    if (!VERSION_HASH_PATTERN.test(requested)) {
      throw new VersionsGitError('a version is a commit id of 7 to 40 hexadecimal characters', 'invalid')
    }
    if ((await this.git.run(['status', '--porcelain'], dir)).stdout.trim() !== '') {
      throw new VersionsGitError('commit or discard the uncommitted changes first', 'conflict')
    }
    let full: string
    try {
      full = (await this.git.run(['rev-parse', '--verify', `${requested}^{commit}`], dir)).stdout.trim()
    } catch (cause) {
      if (cause instanceof VersionsGitError && cause.kind === 'failed') {
        throw new VersionsGitError(`no version matches ${requested}`, 'invalid')
      }
      throw cause
    }
    if (!/^[0-9a-f]{40}$/.test(full)) throw new VersionsGitError(`no version matches ${requested}`, 'invalid')
    const short = (await this.git.run(['rev-parse', '--short', full], dir)).stdout.trim()
    // Ask about the identity before checkout: a missing user.name must not leave a half-restored worktree behind.
    await this.requireIdentity(dir)
    // `read-tree -u --reset` makes the index and the files the version's tree, removals included (`checkout <id> -- .` would keep a file added since).
    await this.git.run(['read-tree', '-u', '--reset', full], dir, undefined, RESTORE_TIMEOUT_MS)
    if ((await this.git.run(['diff', '--cached', '--name-only', '-z'], dir)).stdout === '') {
      throw new VersionsGitError('the working tree already matches this version', 'conflict')
    }
    await this.createCommit(dir, text ?? `Restore ${short}`)
    const entry = await this.headEntry(dir)
    return { restored: short, commit: commitView(entry) }
  }

  /** What a share would send, read without sending anything; no upstream is a refusal. */
  async planShare(path: string): Promise<VersionsSharePlan> {
    return this.plan(await this.git.resolveDirectory(path))
  }

  /**
   * Push the branch to its upstream, only as the person confirmed it: the plan is read again first, and a different one (a version made since, another
   * upstream or address) sends nothing. No upstream is a refusal, and a refusal keeps git's own reason.
   */
  async share(path: string, confirmed: VersionsSharePlan): Promise<VersionsShareView> {
    const dir = await this.git.resolveDirectory(path)
    const now = await this.plan(dir)
    if (!sameSharePlan(now, confirmed)) {
      throw new VersionsGitError('the push changed since you confirmed it; nothing was sent. Look at it again.', 'conflict')
    }
    const upstream = now.upstream
    try {
      await this.git.run(['push'], dir, undefined, PUSH_TIMEOUT_MS)
    } catch (cause) {
      if (cause instanceof VersionsGitError && cause.kind === 'failed') {
        throw new VersionsGitError(
          cause.detail === undefined ? 'git could not push the branch' : `git could not push the branch: ${cause.detail}`,
          'conflict',
        )
      }
      throw cause
    }
    return { pushed: true, upstream }
  }

  private async plan(dir: string): Promise<VersionsSharePlan> {
    const upstream = await this.upstreamOf(dir)
    if (upstream === null) throw new VersionsGitError('the branch has no upstream: publish it first', 'conflict')
    const branch = (await this.git.run(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).stdout.trim()
    const remote = (await this.git.run(['config', '--get', `branch.${branch}.remote`], dir)).stdout.trim()
    const url = (await this.git.run(['remote', 'get-url', remote], dir)).stdout.trim()
    const [ahead] = await this.divergence(dir)
    const head = (await this.git.run(['rev-parse', 'HEAD'], dir)).stdout.trim()
    return { upstream, address: remoteAddress(url), ahead, head }
  }

  private async upstreamOf(dir: string): Promise<string | null> {
    // `git rev-parse` exits 128 when the branch has no upstream; that is an answer, not a failure.
    const value = (await this.git.run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], dir, 128)).stdout.trim()
    return value === '' ? null : value
  }

  private async divergence(dir: string): Promise<[number, number]> {
    const output = (await this.git.run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], dir)).stdout.trim()
    const [aheadText, behindText] = output.split(/\s+/)
    const ahead = Number(aheadText)
    const behind = Number(behindText)
    return [Number.isInteger(ahead) ? ahead : 0, Number.isInteger(behind) ? behind : 0]
  }

  private async headEntry(dir: string): Promise<VersionsEntry> {
    const entry = parseVersionsEntries((await this.git.run(['log', '-1', `--format=${ENTRY_FORMAT}`], dir)).stdout)[0]
    if (entry === undefined) throw new VersionsGitError('the new commit could not be read', 'failed')
    return entry
  }

  private async requireIdentity(dir: string): Promise<void> {
    try {
      await this.git.run(['var', 'GIT_AUTHOR_IDENT'], dir)
    } catch (cause) {
      if (cause instanceof VersionsGitError && cause.kind === 'not-repo') throw cause
      throw new VersionsGitError('git does not know who you are: set user.name and user.email first', 'conflict')
    }
  }

  private async createCommit(dir: string, message: string): Promise<void> {
    try {
      await this.git.run(['commit', '-q', '-m', message], dir, undefined, COMMIT_TIMEOUT_MS)
    } catch (cause) {
      if (cause instanceof VersionsGitError && cause.kind === 'not-repo') throw cause
      throw new VersionsGitError('git could not commit (a commit hook may have refused it)', 'conflict')
    }
  }

  private async commitStaged(dir: string, message: string): Promise<void> {
    if ((await this.git.run(['diff', '--cached', '--name-only', '-z'], dir)).stdout === '') {
      throw new VersionsGitError('nothing to commit', 'conflict')
    }
    await this.requireIdentity(dir)
    await this.createCommit(dir, message)
  }
}
