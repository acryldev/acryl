/**
 * Push and pull for the checked-out branch, the Git tab's "share through git". The Host owns every git call; the client only calls the routes.
 *
 * - The remote is the branch's own (`branch.<name>.remote`), else `origin`, else the only remote. Several remotes and none named `origin` is
 *   refused plainly rather than guessed.
 * - Push sends the branch to its upstream, and on the first push sets it (`--set-upstream`). It is never forced: a remote that has moved on is
 *   said so before git is even asked. It sends work under the person's name, so it is planned first (what, where, to which address) and sends
 *   only the plan the person confirmed, read again just before; a plan that changed meanwhile sends nothing.
 * - Pull fetches, then fast-forwards only. A branch that has moved on both here and there is left exactly as it is, with a sentence that says so.
 * - Every failure carries git's own line (the runner's `detail`): no remote, a refused login, a network that is down.
 *
 * Push and pull run one at a time: a second click waits for the first to finish rather than racing it.
 */
import { samePushPlan, type GitRemoteState, type GitSyncResult, type PushPlan } from './contract.ts'

/** The part of the confined git runner (`acryl-versions`) this module uses: an argument array, never a shell. */
export interface SyncGit {
  run(args: readonly string[], cwd: string, acceptExit?: number, timeoutMs?: number): Promise<{ readonly stdout: string }>
}

/** A fetch or push talks to another machine: as long as the versions' own push (`acryl-versions`). */
const REMOTE_TIMEOUT_MS = 120_000

/** git's own line for a failure, else the fallback: what a person reads in the Git tab. */
function reason(cause: unknown, fallback: string): Error {
  const detail = (cause as { detail?: unknown } | null)?.detail
  return new Error(typeof detail === 'string' && detail !== '' ? detail : fallback)
}

const plural = (count: number, word: string): string => `${String(count)} ${word}${count === 1 ? '' : 's'}`

/** One line of git's output, or `undefined` when git printed nothing. */
async function line(git: SyncGit, root: string, args: readonly string[], acceptExit?: number): Promise<string | undefined> {
  const value = (await git.run(args, root, acceptExit)).stdout.trim()
  return value === '' ? undefined : value
}

interface Where {
  readonly branch: string
  /** The remote the branch goes to; absent when there are several and none is `origin`. */
  readonly remote?: string
  /** The branch's upstream ref on the remote (`refs/heads/main`), when it has one and the remote has it. */
  readonly merge?: string
  /** The upstream as git names it (`origin/main`). */
  readonly upstream?: string
}

type Located = { readonly kind: 'detached' } | { readonly kind: 'no-remote' } | ({ readonly kind: 'branch' } & Where)

/** Which branch is checked out, and where it goes. Reads only local refs and config. */
async function locate(git: SyncGit, root: string): Promise<Located> {
  // `symbolic-ref` exits 1 when HEAD is a commit rather than a branch.
  const branch = await line(git, root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 1)
  if (branch === undefined) return { kind: 'detached' }
  const remotes = (await git.run(['remote'], root)).stdout.split('\n').map(name => name.trim()).filter(name => name !== '')
  if (remotes.length === 0) return { kind: 'no-remote' }
  // `config --get` exits 1 when the key is not set.
  const ownRemote = await line(git, root, ['config', '--get', `branch.${branch}.remote`], 1)
  const merge = await line(git, root, ['config', '--get', `branch.${branch}.merge`], 1)
  const remote = ownRemote !== undefined && remotes.includes(ownRemote)
    ? ownRemote
    : remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : undefined
  if (ownRemote === undefined || merge === undefined || remote !== ownRemote) return { kind: 'branch', branch, ...(remote === undefined ? {} : { remote }) }
  // The upstream is configured; it counts only while its remote-tracking ref is there (a branch deleted on the remote and pruned is unpublished again).
  const upstream = await line(git, root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], 128)
  if (upstream === undefined || await line(git, root, ['rev-parse', '--verify', '--quiet', `${upstream}^{commit}`], 1) === undefined) {
    return { kind: 'branch', branch, remote }
  }
  return { kind: 'branch', branch, remote, merge, upstream }
}

/** Versions here and not upstream, and upstream and not here. */
async function divergence(git: SyncGit, root: string): Promise<{ ahead: number; behind: number }> {
  const [ahead, behind] = (await git.run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], root)).stdout.trim().split(/\s+/u).map(Number)
  return { ahead: Number.isInteger(ahead) ? ahead ?? 0 : 0, behind: Number.isInteger(behind) ? behind ?? 0 : 0 }
}

async function fetchRemote(git: SyncGit, root: string, remote: string): Promise<void> {
  await git.run(['fetch', '--quiet', '--no-write-fetch-head', remote], root, undefined, REMOTE_TIMEOUT_MS)
}

async function stateOf(git: SyncGit, root: string, where: Located, fetchError?: string): Promise<GitRemoteState> {
  if (where.kind !== 'branch') return where
  if (where.upstream === undefined) return { kind: 'unpublished', branch: where.branch, ...(where.remote === undefined ? {} : { remote: where.remote }) }
  return {
    kind: 'tracking',
    branch: where.branch,
    upstream: where.upstream,
    ...await divergence(git, root),
    ...(fetchError === undefined ? {} : { fetchError }),
  }
}

/** The checked-out branch against its remote. With `fetch`, the remote is asked first; when it cannot be reached, its error rides along. */
export async function remoteState(git: SyncGit, root: string, options: { readonly fetch?: boolean } = {}): Promise<GitRemoteState> {
  let where = await locate(git, root)
  let fetchError: string | undefined
  if (options.fetch === true && where.kind === 'branch' && where.upstream !== undefined && where.remote !== undefined) {
    try {
      await fetchRemote(git, root, where.remote)
    } catch (cause) {
      fetchError = reason(cause, 'the remote could not be reached').message
    }
    // A fetch can prune nothing (no `--prune`), but read again so the counts are the fetched ones.
    where = await locate(git, root)
  }
  return stateOf(git, root, where, fetchError)
}

function nothingThere(where: Located, doing: 'push' | 'pull'): Error | undefined {
  if (where.kind === 'detached') return new Error(`The app is not on a branch, so there is nothing to ${doing}.`)
  if (where.kind === 'no-remote') return new Error(`This app has no remote to ${doing} ${doing === 'push' ? 'to' : 'from'}. Add one with git remote add origin <url>.`)
  if (where.remote === undefined) return new Error('This app has several remotes and none is called origin, so which one to use is not plain. Set the branch\'s upstream with git first.')
  return undefined
}

function bothMoved(ahead: number, behind: number): Error {
  return new Error(`This branch and the remote have both moved on (${plural(ahead, 'version')} here, ${plural(behind, 'version')} there). Nothing was changed: bring them together with git first.`)
}

/**
 * The remote's address as a person reads it, never with a credential: `https://user:token@github.com/ana/notes.git` and
 * `git@github.com:ana/notes.git` both read `github.com/ana/notes`; a folder stays its path.
 */
export function remoteAddress(url: string): string {
  // A Windows folder (C:\remotes\notes.git, D:/remotes) would parse as a URL whose scheme is the drive letter.
  if (/^[A-Za-z]:[\\/]/u.test(url)) return url
  const scp = /^[\w.-]+@([\w.-]+):(.+?)(?:\.git)?\/?$/u.exec(url)
  if (scp !== null && !url.includes('://')) return `${scp[1] ?? ''}/${scp[2] ?? ''}`
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname)
    return `${parsed.host}${parsed.pathname.replace(/\.git\/?$/u, '').replace(/\/$/u, '')}`
  } catch {
    // A plain folder path.
    return url
  }
}

export class GitSync {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly git: SyncGit, private readonly root: string) {}

  state(options: { readonly fetch?: boolean } = {}): Promise<GitRemoteState> {
    return remoteState(this.git, this.root, options)
  }

  /** What a push would send and where, after asking the remote; nothing is sent. @throws the one line saying why there is nothing to push. */
  planPush(): Promise<PushPlan> {
    return this.serial(async () => (await this.plan()).plan)
  }

  /**
   * Send exactly the confirmed plan: the branch to its upstream, setting it on the first push. Never forced. The plan is read again first, and a
   * changed one (a new version, the remote moved, another address) sends nothing. @throws an Error whose message is the one line to show.
   */
  push(confirmed: PushPlan): Promise<GitSyncResult> {
    return this.serial(async () => {
      const { git, root } = this
      const { plan, merge } = await this.plan()
      if (!samePushPlan(plan, confirmed)) throw new Error(`The push changed since you confirmed it (${plural(plan.versions, 'version')} to ${plan.target}); nothing was sent. Look at it again.`)
      try {
        // The branch itself (so a first push can set the upstream); its head was just read again and is the confirmed one.
        await git.run(['push', ...(plan.createsBranch ? ['--set-upstream'] : []), plan.remote, `refs/heads/${plan.branch}:${merge}`], root, undefined, REMOTE_TIMEOUT_MS)
      } catch (cause) {
        throw reason(cause, 'git could not push the branch')
      }
      return {
        message: plan.createsBranch ? `Pushed ${plan.branch} to ${plan.remote}; it now follows ${plan.target}.` : `Pushed ${plural(plan.versions, 'version')} to ${plan.target}.`,
        remote: await this.state(),
      }
    })
  }

  /** The plan, and the upstream ref its versions land on (`refs/heads/main`). */
  private async plan(): Promise<{ readonly plan: PushPlan; readonly merge: string }> {
    const { git, root } = this
    const where = await locate(git, root)
    const refused = nothingThere(where, 'push')
    if (refused !== undefined || where.kind !== 'branch' || where.remote === undefined) throw refused ?? new Error('There is nothing to push.')
    const remote = where.remote
    const url = await line(git, root, ['remote', 'get-url', remote])
    const head = await line(git, root, ['rev-parse', '--verify', 'HEAD'])
    if (url === undefined || head === undefined) throw new Error(`The remote ${remote} has no address, or the branch has no version yet.`)
    const address = remoteAddress(url)
    if (where.upstream === undefined || where.merge === undefined) {
      // A first push sends every version the remote has on none of its branches.
      const versions = Number(await line(git, root, ['rev-list', '--count', 'HEAD', '--not', `--remotes=${remote}`]) ?? '0')
      return { plan: { branch: where.branch, remote, target: `${remote}/${where.branch}`, address, versions, createsBranch: true, head }, merge: `refs/heads/${where.branch}` }
    }
    // Ask the remote first, so a push it would refuse is said plainly here instead of as git's "rejected".
    try {
      await fetchRemote(git, root, remote)
    } catch (cause) {
      throw reason(cause, 'the remote could not be reached')
    }
    const { ahead, behind } = await divergence(git, root)
    if (behind > 0 && ahead > 0) throw bothMoved(ahead, behind)
    if (behind > 0) throw new Error(`The remote has ${plural(behind, 'version')} this branch does not. Pull first, then push.`)
    if (ahead === 0) throw new Error(`Nothing to push: ${where.upstream} already has every version.`)
    return { plan: { branch: where.branch, remote, target: where.upstream, address, versions: ahead, createsBranch: false, head }, merge: where.merge }
  }

  /** Bring the upstream's new versions in by fast-forward only; a branch that moved on both sides is left as it is. @throws the one line to show. */
  pull(): Promise<GitSyncResult> {
    return this.serial(async () => {
      const { git, root } = this
      const where = await locate(git, root)
      const refused = nothingThere(where, 'pull')
      if (refused !== undefined || where.kind !== 'branch' || where.remote === undefined) throw refused ?? new Error('There is nothing to pull.')
      if (where.upstream === undefined) throw new Error(`${where.branch} is not on ${where.remote} yet, so there is nothing to pull. Push it first.`)
      try {
        await fetchRemote(git, root, where.remote)
      } catch (cause) {
        throw reason(cause, 'the remote could not be reached')
      }
      const { ahead, behind } = await divergence(git, root)
      if (behind === 0) return { message: `Already up to date with ${where.upstream}.`, remote: await this.state() }
      if (ahead > 0) throw bothMoved(ahead, behind)
      try {
        await git.run(['merge', '--ff-only', '--quiet', '@{upstream}'], root)
      } catch (cause) {
        throw reason(cause, 'git could not bring the versions in')
      }
      return { message: `Pulled ${plural(behind, 'version')} from ${where.upstream}.`, remote: await this.state() }
    })
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }
}

/** The commit the checked-out branch's upstream points at, or `undefined` without one (for the frame state: a push changes it). */
export async function upstreamHead(git: SyncGit, root: string): Promise<string | undefined> {
  try {
    return await line(git, root, ['rev-parse', '--verify', '--quiet', '@{upstream}'], 128)
  } catch {
    return undefined
  }
}
