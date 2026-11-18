/**
 * The Versions routes and view types shared by the Host and Client halves.
 *
 * A version is a commit on the branch. Nothing else is stored: the log is `git log`, the branch and its
 * upstream are `git rev-parse` readings, and ahead/behind say whether the branch is shared.
 */

/** The prefix acryl-versions mounts on the router. */
export const VERSIONS_API_PREFIX = '/api/acryl-versions'
export const VERSIONS_LOG_PATH = `${VERSIONS_API_PREFIX}/log`
export const VERSIONS_SAVE_PATH = `${VERSIONS_API_PREFIX}/save`
export const VERSIONS_RESTORE_PATH = `${VERSIONS_API_PREFIX}/restore`
export const VERSIONS_SHARE_PLAN_PATH = `${VERSIONS_API_PREFIX}/share-plan`
export const VERSIONS_SHARE_PATH = `${VERSIONS_API_PREFIX}/share`

/** The log's page size when the caller names none. */
export const DEFAULT_LOG_LIMIT = 50
/** The most versions one log request may return. */
export const MAX_LOG_LIMIT = 200
/** The longest commit message a save accepts. */
export const MAX_COMMIT_MESSAGE = 5000
/** A version id for restore: an abbreviated or full commit id. */
export const VERSION_HASH_PATTERN = /^[0-9a-f]{7,40}$/i

/** One version, as `git log` reports the commit. */
export interface VersionsEntry {
  /** Full commit id. */
  readonly hash: string
  /** Abbreviated commit id, as git chose it. */
  readonly short: string
  /** First line of the commit message. */
  readonly subject: string
  /** Author name. */
  readonly author: string
  /** Author time, ISO 8601. */
  readonly at: string
}

/** The branch's versions, newest first, and whether the branch is shared. */
export interface VersionsLogView {
  /** Real path of the worktree the log was read from. */
  readonly path: string
  /** The checked-out branch, or null when HEAD is detached. */
  readonly branch: string | null
  /** The branch's upstream (`origin/main`), or null when it has none. */
  readonly upstream: string | null
  /** Commits on HEAD that the upstream does not have (0 without an upstream). */
  readonly ahead: number
  /** Commits on the upstream that HEAD does not have (0 without an upstream). */
  readonly behind: number
  readonly entries: readonly VersionsEntry[]
}

/** A commit without the worktree status: what a save or a restore made. */
export interface VersionsCommitView {
  /** Full commit id. */
  readonly hash: string
  /** Abbreviated commit id. */
  readonly short: string
  /** First line of the commit message. */
  readonly subject: string
}

/** The answer to a save: the new version in full and its three identifying fields. */
export interface VersionsSaveView {
  readonly entry: VersionsEntry
  readonly commit: VersionsCommitView
}

/** The answer to a restore: the version that was brought back and the commit that records it. */
export interface VersionsRestoreView {
  /** Abbreviated id of the version that was restored. */
  readonly restored: string
  /** The new commit; history was not rewritten. */
  readonly commit: VersionsCommitView
}

/**
 * What a share would send, read without sending anything: the person confirms exactly this, and the share sends nothing when it changed meanwhile.
 */
export interface VersionsSharePlan {
  /** The branch's upstream (`origin/main`). */
  readonly upstream: string
  /** Where the remote is, without any credential (`github.com/ana/notes`, or a local path). */
  readonly address: string
  /** How many versions the upstream does not have yet. */
  readonly ahead: number
  /** The commit that would be sent: 40 to 64 hexadecimal characters. */
  readonly head: string
}

/** A plan as the client sent it back, checked field by field; undefined when it is not one. */
export function parseSharePlan(value: unknown): VersionsSharePlan | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { upstream, address, ahead, head } = value as Record<string, unknown>
  if (typeof upstream !== 'string' || upstream === '' || typeof address !== 'string' || address === '') return undefined
  if (typeof ahead !== 'number' || !Number.isInteger(ahead) || ahead < 0) return undefined
  if (typeof head !== 'string' || !/^[0-9a-f]{40,64}$/.test(head)) return undefined
  return { upstream, address, ahead, head }
}

/** Two plans send the same thing. */
export const sameSharePlan = (a: VersionsSharePlan, b: VersionsSharePlan): boolean =>
  a.upstream === b.upstream && a.address === b.address && a.ahead === b.ahead && a.head === b.head

/** The question the person answers before a share, for example "Push 2 versions to origin/main (github.com/ana/notes)?". */
export function shareQuestion(plan: VersionsSharePlan): string {
  return `Push ${String(plan.ahead)} ${plan.ahead === 1 ? 'version' : 'versions'} to ${plan.upstream} (${plan.address})?`
}

/**
 * A remote's address as the person may see it: the host and path, with any user name or token removed (`https://user:token@github.com/ana/notes.git`
 * and `git@github.com:ana/notes.git` both read `github.com/ana/notes`); a local path stays as it is, a Windows one with its drive (`C:\` is a path,
 * not a URL scheme).
 */
export function remoteAddress(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, '')
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(trimmed)) return trimmed
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(trimmed)
  if (scp !== null) return `${scp[1]}/${scp[2]}`
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'file:') {
      const path = decodeURIComponent(parsed.pathname)
      return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path
    }
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '')
  } catch {
    return trimmed
  }
}

/** The answer to a share: the push went through to this upstream. */
export interface VersionsShareView {
  readonly pushed: true
  readonly upstream: string
}
