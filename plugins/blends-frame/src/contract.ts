/** The one route the frame's client reads: what the frame shows around the app, from the Host that serves it. */

export const FRAME_API_PREFIX = '/api/acryl-blends-frame'
export const FRAME_STATE_PATH = `${FRAME_API_PREFIX}/state`
/** POST `{ name }`: a new branch from the checked-out version, switched to (the files stay as they are). */
export const FRAME_BRANCHES_NEW_PATH = `${FRAME_API_PREFIX}/branches/new`
/** POST `{ name }`: the app's folder moves to an existing local branch. */
export const FRAME_BRANCHES_SWITCH_PATH = `${FRAME_API_PREFIX}/branches/switch`
/** GET: `{ chats: { <session id>: <branch> } }`; POST `{ id, branch }`: record which branch a chat was opened on. */
export const FRAME_BRANCH_CHATS_PATH = `${FRAME_API_PREFIX}/branches/chats`
/** POST `{ hashes }`: which of these versions are also on another branch or the remote. */
export const FRAME_VERSIONS_SHARED_PATH = `${FRAME_API_PREFIX}/versions/shared`
/** GET (`?fetch=1` asks the remote first): the checked-out branch against its remote, a {@link GitRemoteState}. */
export const FRAME_GIT_REMOTE_PATH = `${FRAME_API_PREFIX}/git/remote`
/** POST: what a push would send and where (a {@link PushPlan}), after asking the remote; nothing is sent. */
export const FRAME_GIT_PUSH_PLAN_PATH = `${FRAME_API_PREFIX}/git/push-plan`
/**
 * POST `{ confirm }`: send the checked-out branch to its upstream, setting the upstream on the first push, only when `confirm` is the plan the
 * person said yes to and it still holds. Never forced. Answers a {@link GitSyncResult}.
 */
export const FRAME_GIT_PUSH_PATH = `${FRAME_API_PREFIX}/git/push`
/** POST: bring the upstream's new versions in, by fast-forward only; a branch that has moved on both sides is left as it is. Answers a {@link GitSyncResult}. */
export const FRAME_GIT_PULL_PATH = `${FRAME_API_PREFIX}/git/pull`

/** POST: the app's snapshot verb `capture` (a row for every plugin folder that has none, then `blend.lock.json`). Answers a {@link SnapshotCapture}. */
export const FRAME_SNAPSHOT_CAPTURE_PATH = `${FRAME_API_PREFIX}/snapshot/capture`

/** What a capture did: the plugin folders that got a row, and how many plugins the lock now records. */
export interface SnapshotCapture {
  readonly addedRows: readonly string[]
  readonly modules: number
}

/** A snapshot against its lock: `problems` names `blend.yaml` or each plugin folder that changed since the capture. */
export interface SnapshotVerify {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly checked: number
}

/** What an apply did; nothing is written when `ok` is false. `extra` are the app's folders the snapshot lacks, kept and switched off. */
export interface SnapshotApply {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly modules: ReadonlyArray<{ readonly name: string; readonly status: 'added' | 'unchanged' | 'conflict' | 'skipped'; readonly detail?: string }>
  readonly manifestChanged: boolean
  readonly extra: readonly string[]
}

const isWords = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

/** @throws when the answer is not a capture result. */
export function parseSnapshotCapture(value: unknown): SnapshotCapture {
  if (!isRecord(value) || !isWords(value.addedRows) || !isCount(value.modules)) throw new Error('snapshot capture: not a result')
  return { addedRows: value.addedRows, modules: value.modules }
}

/**
 * The checked-out branch against its remote:
 * - `detached`: the folder is on no branch, so there is nothing to push or pull;
 * - `no-remote`: the repository has no remote;
 * - `unpublished`: the branch is not on the remote yet (its first push sets the upstream); `remote` is absent when there are several remotes and
 *   none is `origin`, so which one to use is not plain;
 * - `tracking`: the branch has an upstream; `ahead` versions are here and not there, `behind` there and not here. `fetchError` is git's line when
 *   asking the remote failed, and the counts are then as of the last time it answered.
 */
export type GitRemoteState =
  | { readonly kind: 'detached' }
  | { readonly kind: 'no-remote' }
  | { readonly kind: 'unpublished'; readonly branch: string; readonly remote?: string }
  | {
    readonly kind: 'tracking'
    readonly branch: string
    readonly upstream: string
    readonly ahead: number
    readonly behind: number
    readonly fetchError?: string
  }

/**
 * What a push will do, shown to the person before anything is sent: the versions it sends, the branch they land on and the remote's address
 * (without any credential), and whether the branch is created there. A push sends exactly this, or nothing.
 */
export interface PushPlan {
  readonly branch: string
  readonly remote: string
  /** Where the versions land, as git names it (`origin/main`). */
  readonly target: string
  /** The remote as a person reads it: `github.com/ana/notes`, or a folder's path. */
  readonly address: string
  /** Versions here and not there. */
  readonly versions: number
  /** The branch is not on the remote yet: the push creates it. */
  readonly createsBranch: boolean
  /** The commit sent; a version made after the yes changes the plan, so nothing is sent. */
  readonly head: string
}

/** @throws when the value is not a push plan. */
export function parsePushPlan(value: unknown): PushPlan {
  if (!isRecord(value)) throw new Error('push plan: not a plan')
  const { branch, remote, target, address, versions, createsBranch, head } = value
  if (!isName(branch) || !isName(remote) || !isName(target) || !isName(address)) throw new Error('push plan: names')
  if (!isCount(versions) || typeof createsBranch !== 'boolean' || typeof head !== 'string' || !/^[0-9a-f]{40,64}$/u.test(head)) throw new Error('push plan: versions')
  return { branch, remote, target, address, versions, createsBranch, head }
}

/** The same push: what the person confirmed is what would be sent now. */
export function samePushPlan(a: PushPlan, b: PushPlan): boolean {
  return a.branch === b.branch && a.remote === b.remote && a.target === b.target && a.address === b.address && a.versions === b.versions
    && a.createsBranch === b.createsBranch && a.head === b.head
}

/** What a push or pull did, in one line, and the remote state after it. */
export interface GitSyncResult {
  readonly message: string
  readonly remote: GitRemoteState
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isName = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** @throws when the answer is not a remote state. */
export function parseGitRemoteState(value: unknown): GitRemoteState {
  if (!isRecord(value)) throw new Error('git remote: not an object')
  switch (value.kind) {
    case 'detached':
    case 'no-remote':
      return { kind: value.kind }
    case 'unpublished':
      if (!isName(value.branch)) throw new Error('git remote: branch')
      if (value.remote !== undefined && !isName(value.remote)) throw new Error('git remote: remote')
      return { kind: 'unpublished', branch: value.branch, ...(value.remote === undefined ? {} : { remote: value.remote }) }
    case 'tracking':
      if (!isName(value.branch) || !isName(value.upstream)) throw new Error('git remote: branch')
      if (!isCount(value.ahead) || !isCount(value.behind)) throw new Error('git remote: counts')
      if (value.fetchError !== undefined && typeof value.fetchError !== 'string') throw new Error('git remote: fetchError')
      return {
        kind: 'tracking',
        branch: value.branch,
        upstream: value.upstream,
        ahead: value.ahead,
        behind: value.behind,
        ...(value.fetchError === undefined ? {} : { fetchError: value.fetchError }),
      }
    default:
      throw new Error('git remote: kind')
  }
}

/** @throws when the answer is not a push or pull result. */
export function parseGitSyncResult(value: unknown): GitSyncResult {
  if (!isRecord(value) || typeof value.message !== 'string') throw new Error('git sync: message')
  return { message: value.message, remote: parseGitRemoteState(value.remote) }
}

/** @throws when the answer is not a list of version hashes. */
export function parseSharedVersions(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.shared)) throw new Error('shared versions: not a list')
  return value.shared.map((hash: unknown) => {
    if (typeof hash !== 'string' || hash === '') throw new Error('shared versions: entry')
    return hash
  })
}

/** What the Host remembers of the chats: the branch each belongs to, and which are open (null until they were first decided). */
export interface BranchChatsView {
  readonly chats: Record<string, string>
  readonly open: string[] | null
}

/** @throws when the answer is not a map of chat id to branch name with the list of open chats. */
export function parseBranchChats(value: unknown): BranchChatsView {
  if (!isRecord(value) || !isRecord(value.chats)) throw new Error('branch chats: not a map')
  const chats: Record<string, string> = {}
  for (const [id, branch] of Object.entries(value.chats)) {
    if (id === '' || typeof branch !== 'string' || branch === '') throw new Error('branch chats: entry')
    chats[id] = branch
  }
  if (value.open === null || value.open === undefined) return { chats, open: null }
  if (!Array.isArray(value.open) || value.open.some((id: unknown) => typeof id !== 'string' || id === '')) throw new Error('branch chats: open')
  return { chats, open: value.open as string[] }
}

/**
 * Why a name cannot be a new branch, in words for the person typing it; `undefined` when it can. The Host asks git as well
 * (`check-ref-format --branch`), so this only catches what is plain to see while typing.
 */
export function branchNameProblem(name: string): string | undefined {
  if (name.trim() === '') return 'Name the branch.'
  if (name.length > 100) return 'Use a shorter name.'
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(name)) return 'Use letters, digits, - _ . and /, starting with a letter or digit.'
  if (name.includes('..') || name.includes('//') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return 'That is not a name git accepts.'
  return undefined
}

/** A local branch of the app's repository. */
export interface FrameBranch {
  readonly name: string
  /** The branch the app's folder has checked out. */
  readonly current: boolean
}

export interface FrameState {
  /** The app's name: its folder's name. */
  readonly appName: string
  /** The app's folder, which the versions calls take as their path. */
  readonly appRoot: string
  /** Where the app's own page is served, an absolute path on the frame's origin (`/app`); absent when the Host serves no app. */
  readonly appPage?: string
  /** Local branches, the checked-out one marked; empty when the folder is not a git repository. */
  readonly branches: readonly FrameBranch[]
  /** The checked-out commit; absent before the first version or outside a repository. A change means the versions changed. */
  readonly head?: string
  /** Files changed since the last version; absent outside a repository. */
  readonly unsaved?: number
  /** The commit the checked-out branch's upstream points at, as last fetched or pushed; absent without one. A change means the shared marks changed. */
  readonly upstreamHead?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @throws an Error naming the field when the answer is not a frame state. */
export function parseFrameState(value: unknown): FrameState {
  if (!isRecord(value)) throw new Error('frame state: not an object')
  const { appName, appRoot, appPage, branches, head, unsaved, upstreamHead } = value
  if (typeof appName !== 'string' || appName === '') throw new Error('frame state: appName')
  if (typeof appRoot !== 'string' || appRoot === '') throw new Error('frame state: appRoot')
  if (appPage !== undefined && (typeof appPage !== 'string' || !appPage.startsWith('/'))) throw new Error('frame state: appPage')
  if (!Array.isArray(branches)) throw new Error('frame state: branches')
  if (head !== undefined && (typeof head !== 'string' || head === '')) throw new Error('frame state: head')
  if (unsaved !== undefined && (typeof unsaved !== 'number' || !Number.isInteger(unsaved) || unsaved < 0)) throw new Error('frame state: unsaved')
  if (upstreamHead !== undefined && (typeof upstreamHead !== 'string' || upstreamHead === '')) throw new Error('frame state: upstreamHead')
  const parsed = branches.map((branch: unknown) => {
    if (!isRecord(branch) || typeof branch.name !== 'string' || typeof branch.current !== 'boolean') throw new Error('frame state: branch')
    return { name: branch.name, current: branch.current }
  })
  return {
    appName,
    appRoot,
    ...(appPage === undefined ? {} : { appPage }),
    branches: parsed,
    ...(head === undefined ? {} : { head }),
    ...(unsaved === undefined ? {} : { unsaved }),
    ...(upstreamHead === undefined ? {} : { upstreamHead }),
  }
}

export const FRAME_PLUGINS_PATH = `${FRAME_API_PREFIX}/plugins`
export const FRAME_PLUGINS_SWITCH_PATH = `${FRAME_API_PREFIX}/plugins/switch`
/** POST `{ name }`: what sharing this local plugin would do (a {@link SharePlan}); nothing leaves the machine. */
/** POST `{ owner?, visibility? }`: what sharing the whole app to GitHub would send (Settings > Share); sends nothing. */
export const FRAME_APP_SHARE_PLAN_PATH = `${FRAME_API_PREFIX}/app/share-plan`
/** POST `{ owner?, visibility?, confirm }`: share the app exactly as the confirmed plan says, or nothing. */
export const FRAME_APP_SHARE_PATH = `${FRAME_API_PREFIX}/app/share`
/** POST `{ png: base64 }`: the app's own icon (assets/icon.png), drawn by the page at 512 px. */
export const FRAME_APP_ICON_PATH = `${FRAME_API_PREFIX}/app/icon`

/** Who may see a shared app, and under which account; both optional (the signed-in account, blend.yaml's visibility). */
export interface AppShareRequest {
  readonly owner?: string
  readonly visibility?: 'private' | 'public'
  /** List it in the Blends store; a part not given is the app's own (its earlier place, else its starter's category; MIT). */
  readonly list?: { readonly category?: string; readonly subcategory?: string; readonly license?: string }
}

/** The Blends store's categories (published by acrylblends.github.io; @acryldev/app-persistence CATEGORIES_URL names the same list). */
export const STORE_CATEGORIES_URL = 'https://acrylblends.github.io/categories.json'

/** How the Blends store will list the app (the save plugin's StoreListing): its id, place (category slugs), licence and the tag people start from. */
export interface AppStoreListingView {
  readonly id: string
  readonly placement: { readonly category: string; readonly subcategory?: string }
  readonly license: string
  readonly tag: string
}

/** What sharing the app sends: the save plugin's plan, shown before anything leaves the computer. */
export interface AppSharePlanView {
  /** `owner/name` of a repository the share creates, or the address of the one the app already pushes to. */
  readonly repository: string
  readonly create: boolean
  readonly visibility: 'private' | 'public'
  /** Files changed since the last save; the share saves them first. */
  readonly changes: number
  readonly listing?: AppStoreListingView
}

/** Where the app went. */
export interface AppSharedView {
  readonly remote: string
  readonly created: boolean
  /** The tag the store lists, and whether this share made it (an existing tag is kept). */
  readonly listed?: { readonly tag: string; readonly created: boolean }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const LICENSE = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/u

function parseListing(value: unknown): AppStoreListingView | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || !isRecord(value.placement)) throw new Error('app share plan: listing')
  const { id, license, tag } = value
  const { category, subcategory } = value.placement
  if (typeof id !== 'string' || typeof license !== 'string' || typeof tag !== 'string' || typeof category !== 'string') throw new Error('app share plan: listing')
  if (subcategory !== undefined && typeof subcategory !== 'string') throw new Error('app share plan: listing subcategory')
  return { id, placement: { category, ...(subcategory === undefined ? {} : { subcategory }) }, license, tag }
}

export function parseAppSharePlan(value: unknown): AppSharePlanView {
  if (!isRecord(value)) throw new Error('app share plan: not a plan')
  const { repository, create, visibility, changes } = value
  if (typeof repository !== 'string' || repository === '' || typeof create !== 'boolean') throw new Error('app share plan: repository')
  if (visibility !== 'private' && visibility !== 'public') throw new Error('app share plan: visibility')
  if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || changes < 0) throw new Error('app share plan: changes')
  const listing = parseListing(value.listing)
  return { repository, create, visibility, changes, ...(listing === undefined ? {} : { listing }) }
}

export function parseAppShared(value: unknown): AppSharedView {
  if (!isRecord(value) || typeof value.remote !== 'string' || typeof value.created !== 'boolean') throw new Error('app share: where it went')
  const listed = isRecord(value.listed) && typeof value.listed.tag === 'string' && typeof value.listed.created === 'boolean'
    ? { tag: value.listed.tag, created: value.listed.created }
    : undefined
  return { remote: value.remote, created: value.created, ...(listed === undefined ? {} : { listed }) }
}

/**
 * The GitHub account or organization a person typed to share a plugin to (blank: theirs). `undefined` when none was asked, `null` when what came is not a GitHub name
 * (it goes to a command line: only a name that cannot start with a dash or hold a space or a slash).
 */
export function parseShareOwner(value: unknown): string | undefined | null {
  if (value === undefined || value === '') return undefined
  return typeof value === 'string' && GITHUB_NAME.test(value) ? value : null
}

export function parseAppShareRequest(value: unknown): AppShareRequest | undefined {
  if (!isRecord(value)) return undefined
  const { owner, visibility, list } = value
  if (owner !== undefined && (typeof owner !== 'string' || !GITHUB_NAME.test(owner))) return undefined
  if (visibility !== undefined && visibility !== 'private' && visibility !== 'public') return undefined
  if (list !== undefined && !isRecord(list)) return undefined
  const asked = list === undefined ? undefined : { category: list.category, subcategory: list.subcategory, license: list.license }
  // Passed to a command line: only addresses and a licence id, never anything a shell or the parser could take as a flag.
  if (asked !== undefined && ([asked.category, asked.subcategory].some(slug => slug !== undefined && (typeof slug !== 'string' || !SLUG.test(slug)))
    || (asked.license !== undefined && (typeof asked.license !== 'string' || !LICENSE.test(asked.license))))) return undefined
  if (asked !== undefined && asked.category === undefined && asked.subcategory !== undefined) return undefined
  return {
    ...(owner === undefined ? {} : { owner }),
    ...(visibility === undefined ? {} : { visibility }),
    ...(asked === undefined ? {} : { list: Object.fromEntries(Object.entries(asked).filter(([, v]) => v !== undefined)) as NonNullable<AppShareRequest['list']> }),
  }
}

export const FRAME_PLUGINS_SHARE_PLAN_PATH = `${FRAME_API_PREFIX}/plugins/share-plan`
/** POST `{ name, confirm }`: publish it, only when `confirm` is the plan the person said yes to and it still holds. */
export const FRAME_PLUGINS_SHARE_PATH = `${FRAME_API_PREFIX}/plugins/share`
/** POST `{ name }`: keep a packed copy of this local plugin on this machine (the app's plugin store); nothing leaves the machine. */
export const FRAME_PLUGINS_SAVE_PATH = `${FRAME_API_PREFIX}/plugins/save`
/** GET: the public plugin registry (cordisplugins.github.io), each entry marked when this app already has it; read fresh by the Host, never by the page. */
export const FRAME_PLUGINS_REGISTRY_PATH = `${FRAME_API_PREFIX}/plugins/registry`
/** GET: whether this computer can share to GitHub (the helper program is installed and signed in), read before the person is asked anything. */
export const FRAME_PLUGINS_GITHUB_PATH = `${FRAME_API_PREFIX}/plugins/github`
/** POST: start GitHub's browser sign-in (a one-time code for github.com/login/device); GET: where it is; DELETE: stop one still waiting. */
export const FRAME_PLUGINS_GITHUB_CONNECT_PATH = `${FRAME_API_PREFIX}/plugins/github/connect`
/** POST `{ source }`: pull one released plugin (`github:<owner>/<repo>@<version>`) into the running app, through the app's plugin-share checks. */
export const FRAME_PLUGINS_PULL_PATH = `${FRAME_API_PREFIX}/plugins/pull`

/** A packed copy of a plugin kept on this machine: its version and where the tarball is. */
export interface SavedPluginView {
  readonly version: string
  /** Absolute path of the packed copy (the store's `.tgz`). */
  readonly path: string
}

/** What a save did: the copy, whether it is new, and whether the version was raised because that version was already saved with other content. */
export interface SavedPluginResult extends SavedPluginView {
  readonly added: boolean
  readonly bumped: boolean
}

/** Where a shared plugin went: its GitHub repository and the released version other apps install. */
export interface SharedPluginView {
  readonly url: string
  readonly version: string
  /** GitHub says the repository no longer exists (deleted or renamed): the row shows it gone and offers a new share. */
  readonly gone?: boolean
  /** It was shared to the public registry (the `cordis-plugin` topic is set), not only as a public repository. */
  readonly registry?: boolean
}

export type ShareVisibility = 'private' | 'public'

/**
 * What a share will do, shown to the person before anything is sent: the GitHub repository it goes to (created when it does not exist), the version
 * it releases and who can see it. A share publishes exactly this plan, or nothing.
 */
export interface SharePlan {
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly visibility: ShareVisibility
  /** The repository does not exist yet: the share creates it. */
  readonly createsRepository: boolean
  /** The version already released there; the plan then releases the next patch. */
  readonly released?: string
  /** The license a public share is offered under, as an SPDX id (MIT unless the app says otherwise); a private share has none. */
  readonly license?: string
  /** The public registry (cordisplugins.github.io) lists it: the share sets the `cordis-plugin` topic. Only a public share can be listed. */
  readonly registry?: boolean
  /** Where the registry lists it (category slugs of acrylblends.github.io/blends): the app's own store place, written as package.json keywords. */
  readonly placement?: { readonly category: string; readonly subcategory?: string }
}

const GITHUB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u

/** @throws when the value is not a share plan. */
export function parseSharePlan(value: unknown): SharePlan {
  if (!isRecord(value)) throw new Error('share plan: not a plan')
  const { owner, repo, version, visibility, createsRepository, released, license, registry, placement } = value
  if (typeof owner !== 'string' || !GITHUB_NAME.test(owner) || typeof repo !== 'string' || !GITHUB_NAME.test(repo)) throw new Error('share plan: repository')
  if (typeof version !== 'string' || version === '' || (released !== undefined && (typeof released !== 'string' || released === ''))) throw new Error('share plan: version')
  if ((visibility !== 'private' && visibility !== 'public') || typeof createsRepository !== 'boolean') throw new Error('share plan: visibility')
  if (license !== undefined && (typeof license !== 'string' || !/^[A-Za-z0-9.+-]+$/u.test(license))) throw new Error('share plan: license')
  if (registry !== undefined && typeof registry !== 'boolean') throw new Error('share plan: registry')
  if (registry === true && visibility !== 'public') throw new Error('share plan: only a public share can be listed in the registry')
  const place = placement === undefined ? undefined : isRecord(placement) && typeof placement.category === 'string' && (placement.subcategory === undefined || typeof placement.subcategory === 'string')
    ? { category: placement.category, ...(typeof placement.subcategory === 'string' ? { subcategory: placement.subcategory } : {}) }
    : null
  if (place === null) throw new Error('share plan: placement')
  return { owner, repo, version, visibility, createsRepository, ...(released === undefined ? {} : { released }), ...(license === undefined ? {} : { license }), ...(registry === true ? { registry } : {}), ...(place === undefined ? {} : { placement: place }) }
}

/** @throws when the value is not what a save answers. */
export function parseSavedPlugin(value: unknown): SavedPluginResult {
  if (!isRecord(value) || typeof value.version !== 'string' || value.version === '' || typeof value.path !== 'string' || value.path === ''
    || typeof value.added !== 'boolean' || typeof value.bumped !== 'boolean') throw new Error('save: not a saved plugin')
  return { version: value.version, path: value.path, added: value.added, bumped: value.bumped }
}

/** The same plan: what the person confirmed is what would be published now. */
export function samePlan(a: SharePlan, b: SharePlan): boolean {
  return a.owner === b.owner && a.repo === b.repo && a.version === b.version && a.visibility === b.visibility
    && a.createsRepository === b.createsRepository && a.released === b.released && a.license === b.license && (a.registry === true) === (b.registry === true)
    && a.placement?.category === b.placement?.category && a.placement?.subcategory === b.placement?.subcategory
}

/**
 * Where a plugin of the app comes from: a row of the app's `blend.yaml` (the library plugins the app was made with), or a plugin written into the
 * app's `plugins/` folder after it was made (what agents build; the `extensions` row starts them).
 */
export type AppPluginKind = 'row' | 'made'

/** One plugin of the app, as Settings → Plugins lists it. */
export interface AppPluginView {
  readonly name: string
  readonly kind: AppPluginKind
  /** Who wrote it: the agent or person of its first commit; absent for a library row. */
  readonly by?: string
  /** When it was first committed (ISO time); absent when it is not saved yet or a library row. */
  readonly at?: string
  /** Not committed yet: it runs, but no version has it. */
  readonly unsaved?: boolean
  /** The library release a library row was copied from (`plugins/library.lock.json`). */
  readonly version?: string
  /** A local plugin this app shared: where it went (a GitHub repository) and the version it released. */
  readonly shared?: SharedPluginView
  /** The newest packed copy of it kept on this machine (the app's plugin store). */
  readonly saved?: SavedPluginView
  /** Absolute path of the plugin's folder, where its code is. */
  readonly folder?: string
  /** The plugin's main file, relative to the app's folder: absent when that file is outside the app (a package of `node_modules` elsewhere). */
  readonly main?: string
  readonly description: string
  readonly on: boolean
}

/** How one of the frame's own Loader rows runs: started, waiting for a service it needs, failed to start, or switched off. */
export type FramePluginState = 'active' | 'waiting' | 'failed' | 'off'

/** One of the frame's own plugins (its Loader rows around the app): shown, not switched here. */
export interface FramePluginView {
  readonly id: string
  readonly name: string
  readonly version?: string
  readonly description: string
  readonly state: FramePluginState
  /** Absolute path of the package folder, where its code is. */
  readonly folder?: string
  /** The package's main file relative to the app's folder; absent when it is outside the app. */
  readonly main?: string
}

export interface AppPluginsView {
  readonly plugins: readonly AppPluginView[]
  readonly frame: readonly FramePluginView[]
}

const FRAME_PLUGIN_STATES: readonly string[] = ['active', 'waiting', 'failed', 'off'] satisfies FramePluginState[]

/** @throws when the answer is not a plugin list. */
export function parseAppPluginsView(value: unknown): AppPluginsView {
  if (!isRecord(value) || !Array.isArray(value.plugins)) throw new Error('plugins: not a list')
  return {
    plugins: value.plugins.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.name !== 'string' || (entry.kind !== 'row' && entry.kind !== 'made')
        || typeof entry.description !== 'string' || typeof entry.on !== 'boolean') throw new Error('plugins: entry')
      return {
        name: entry.name,
        kind: entry.kind,
        ...(typeof entry.by === 'string' ? { by: entry.by } : {}),
        ...(typeof entry.at === 'string' ? { at: entry.at } : {}),
        ...(entry.unsaved === true ? { unsaved: true } : {}),
        ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
        ...(isRecord(entry.shared) && typeof entry.shared.url === 'string' && typeof entry.shared.version === 'string'
          ? { shared: { url: entry.shared.url, version: entry.shared.version, ...(entry.shared.gone === true ? { gone: true } : {}), ...(entry.shared.registry === true ? { registry: true } : {}) } }
          : {}),
        ...(isRecord(entry.saved) && typeof entry.saved.version === 'string' && typeof entry.saved.path === 'string'
          ? { saved: { version: entry.saved.version, path: entry.saved.path } }
          : {}),
        ...(typeof entry.folder === 'string' ? { folder: entry.folder } : {}),
        ...(typeof entry.main === 'string' ? { main: entry.main } : {}),
        description: entry.description,
        on: entry.on,
      }
    }),
    frame: (Array.isArray(value.frame) ? value.frame : []).map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.description !== 'string'
        || typeof entry.state !== 'string' || !FRAME_PLUGIN_STATES.includes(entry.state)) throw new Error('plugins: frame entry')
      return {
        id: entry.id,
        name: entry.name,
        ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
        description: entry.description,
        state: entry.state as FramePluginState,
        ...(typeof entry.folder === 'string' ? { folder: entry.folder } : {}),
        ...(typeof entry.main === 'string' ? { main: entry.main } : {}),
      }
    }),
  }
}

export const FRAME_FEEDBACK_PATH = `${FRAME_API_PREFIX}/feedback`
export const FRAME_FEEDBACK_SEEN_PATH = `${FRAME_API_PREFIX}/feedback/seen`
/** GET `?id=`: one note's screenshot, served by the frame so the left panel and the chat hand-off never depend on the app's mount. */
export const FRAME_FEEDBACK_SHOT_PATH = `${FRAME_API_PREFIX}/feedback/shot`

/** One note a person sent from the app (the `feedback` plugin), as the left panel shows it. */
export interface FeedbackNoteView {
  readonly id: string
  /** ISO time it was sent. */
  readonly at: string
  readonly text: string
  /** The page's path it was sent from. */
  readonly page: string
  /** The element it was pinned on; absent for "Nothing specific". */
  readonly element?: { readonly selector: string; readonly label: string }
  /** What the person saw when they sent it; absent when the browser refused the capture. */
  readonly screenshot?: { readonly mediaType: 'image/webp' | 'image/png'; readonly width: number; readonly height: number }
  readonly seen: boolean
}

/** `available` is false when the app has no `feedback` plugin (or it is switched off): the left panel then shows no section. */
export interface FeedbackView {
  readonly available: boolean
  readonly notes: readonly FeedbackNoteView[]
}

/** @throws when the value is not a list of notes. */
export function parseFeedbackNotes(value: unknown): FeedbackNoteView[] {
  if (!Array.isArray(value)) throw new Error('feedback: not a list')
  return value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.at !== 'string' || typeof entry.text !== 'string'
      || typeof entry.page !== 'string' || typeof entry.seen !== 'boolean') throw new Error('feedback: note')
    const element = entry.element
    const pinned = isRecord(element) && typeof element.selector === 'string' && typeof element.label === 'string'
      ? { element: { selector: element.selector, label: element.label } }
      : {}
    const shot = entry.screenshot
    let screenshot: Pick<FeedbackNoteView, 'screenshot'> = {}
    if (isRecord(shot) && (shot['mediaType'] === 'image/webp' || shot['mediaType'] === 'image/png')
      && typeof shot['width'] === 'number' && typeof shot['height'] === 'number') {
      screenshot = { screenshot: { mediaType: shot['mediaType'], width: shot['width'], height: shot['height'] } }
    }
    const note: FeedbackNoteView = { id: entry.id, at: entry.at, text: entry.text, page: entry.page, ...pinned, ...screenshot, seen: entry.seen }
    return note
  })
}

/** @throws when the answer is not a feedback view. */
export function parseFeedbackView(value: unknown): FeedbackView {
  if (!isRecord(value) || typeof value.available !== 'boolean') throw new Error('feedback: not a view')
  return { available: value.available, notes: parseFeedbackNotes(value.notes) }
}

/** GET `?session=<id>`: what each of that chat's turns saved (`ChatSavesView`). */
export const FRAME_CHAT_SAVES_PATH = `${FRAME_API_PREFIX}/chat-saves`

/** The save point the frame made by itself when a chat turn changed the app's files. */
export interface TurnSaveView {
  /** The chat turn (DSH's turn number) that changed the files. */
  readonly turn: number
  /** The files the turn changed, relative to the app's folder. */
  readonly files: readonly string[]
  /** The version the turn was saved as: its commit, how many versions the branch had then (`v7`), and what it was called. */
  readonly hash: string
  readonly version: number
  readonly subject: string
}

export interface ChatSavesView {
  readonly saves: readonly TurnSaveView[]
}

/** @throws when the value is not a list of turn saves. */
export function parseChatSaves(value: unknown): ChatSavesView {
  if (!isRecord(value) || !Array.isArray(value.saves)) throw new Error('chat saves: not a list')
  return {
    saves: value.saves.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.turn !== 'number' || !Number.isInteger(entry.turn) || !Array.isArray(entry.files)
        || !entry.files.every((file: unknown) => typeof file === 'string') || typeof entry.hash !== 'string' || entry.hash === ''
        || typeof entry.version !== 'number' || !Number.isInteger(entry.version) || entry.version < 1 || typeof entry.subject !== 'string') {
        throw new Error('chat saves: entry')
      }
      return { turn: entry.turn, files: entry.files as string[], hash: entry.hash, version: entry.version, subject: entry.subject }
    }),
  }
}

/** GET: the chats that have at least one turn, each with its name (`RealChatsView`); a chat nobody has written to is not a chat the frame lists. */
export const FRAME_REAL_CHATS_PATH = `${FRAME_API_PREFIX}/real-chats`

export interface RealChatView {
  readonly id: string
  readonly title: string
}

export interface RealChatsView {
  readonly chats: readonly RealChatView[]
}

/** @throws when the value is not a list of chats. */
export function parseRealChats(value: unknown): RealChatsView {
  if (!isRecord(value) || !Array.isArray(value.chats)) throw new Error('real chats: not a list')
  return {
    chats: value.chats.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string') throw new Error('real chats: entry')
      return { id: entry.id, title: entry.title }
    }),
  }
}

/**
 * GET: the app's code as the Host runs it - `{ seq, generation, error }` (./app-reload.ts). With `?after=<seq>` the Host answers when `seq` differs
 * from that (or after a while with the same answer), so the page hears of a new generation as it is up, without a timer.
 */
export const FRAME_APP_PATH = `${FRAME_API_PREFIX}/app`
/** POST `{ session, label, page, selector }`: the element the chat message being sent is about, for the Host to hand to the agent as context. */
export const FRAME_SELECTION_PATH = `${FRAME_API_PREFIX}/selection`

/** Which code the app runs: a new `generation` means the app's files were loaded again; `error` is why the last load was refused (the last good code runs on). */
export interface AppReloadView {
  /** Changes with every other field: the long poll's cursor. */
  readonly seq: number
  /** 0 for the code the host started with, plus one for each reload that took. */
  readonly generation: number
  readonly error: string | null
}

/** @throws an Error naming the field when the answer is not an app reload view. */
export function parseAppReloadView(value: unknown): AppReloadView {
  if (!isRecord(value)) throw new Error('app reload: not an object')
  const { seq, generation, error } = value
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) throw new Error('app reload: seq')
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 0) throw new Error('app reload: generation')
  if (error !== null && typeof error !== 'string') throw new Error('app reload: error')
  return { seq, generation, error }
}

/** What a plugin of the registry offers, as the registry's index lists it (`https://cordisplugins.github.io/registry/index.json`, formatVersion 1). */
/** Official: released from one of the project's organisations; community: from anyone else. The registry decides it from the repository owner's GitHub id. */
export type RegistryOrigin = 'official' | 'community'

export interface RegistryEntryView {
  /** The plugin's name; a scoped name keeps its scope. */
  readonly name: string
  readonly description: string
  /** The GitHub account or organization that released it. */
  readonly owner: string
  /** The repository's address. */
  readonly url: string
  readonly version: string
  /** The day of the release (`YYYY-MM-DD`), when the index says. */
  readonly published?: string
  /** Where it runs: `ACRYL` (needs an ACRYL service), `Both`, or `DSH stock` (a Harness plugin, which an app of this kind cannot run). */
  readonly compatibility: string
  readonly origin: RegistryOrigin
  /** The source a pull takes: `github:<owner>/<repo>@<version>`. */
  readonly source: string
  /** This app already has a plugin of this name or pulled from this source. */
  readonly installed: boolean
  /** The account the person is signed in to GitHub with (or shares to) released it. */
  readonly mine: boolean
  /** The version the app pulled it at, when the registry lists a newer one: the row offers the update. */
  readonly updateFrom?: string
  /** Bytes it downloads besides itself for this computer (a native package, plugin-share/native.ts), when the index says. */
  readonly download?: number
}

/** The registry as the Host read it: its entries, or why they could not be read (offline, rate limited, the site changed). */
export type RegistryView =
  | { readonly status: 'ready'; readonly entries: readonly RegistryEntryView[]; readonly readAt: string }
  | { readonly status: 'unavailable'; readonly message: string }

/** @throws when the value is not a registry view. */
export function parseRegistryView(value: unknown): RegistryView {
  if (!isRecord(value)) throw new Error('registry: not a view')
  if (value.status === 'unavailable') {
    if (typeof value.message !== 'string') throw new Error('registry: message')
    return { status: 'unavailable', message: value.message }
  }
  if (value.status !== 'ready' || !Array.isArray(value.entries) || typeof value.readAt !== 'string') throw new Error('registry: not a view')
  const entries = value.entries.map((entry: unknown): RegistryEntryView => {
    if (!isRecord(entry)) throw new Error('registry: entry')
    const { name, description, owner, url, version, published, compatibility, origin, source, installed, mine, updateFrom, download } = entry
    if (typeof name !== 'string' || typeof description !== 'string' || typeof owner !== 'string' || typeof url !== 'string' || typeof version !== 'string'
      || typeof compatibility !== 'string' || typeof source !== 'string' || typeof installed !== 'boolean' || typeof mine !== 'boolean') throw new Error('registry: entry')
    return { name, description, owner, url, version, ...(typeof published === 'string' ? { published } : {}), compatibility, origin: origin === 'official' ? 'official' : 'community', source, installed, mine, ...(typeof updateFrom === 'string' ? { updateFrom } : {}), ...(typeof download === 'number' && download > 0 ? { download } : {}) }
  })
  return { status: 'ready', entries, readAt: value.readAt }
}

/** What a pull did: the plugin now running, or why it was refused (nothing changed then). */
export interface PulledPluginView {
  readonly name: string
  readonly version: string
  readonly action: 'installed' | 'updated' | 'unchanged'
  readonly state: string
}

/** @throws when the value is not what a pull answers. */
export function parsePulledPlugin(value: unknown): PulledPluginView {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.version !== 'string' || typeof value.state !== 'string'
    || (value.action !== 'installed' && value.action !== 'updated' && value.action !== 'unchanged')) throw new Error('pull: not a pulled plugin')
  return { name: value.name, version: value.version, action: value.action, state: value.state }
}

/** Whether the person can share to GitHub now, and when not, the single thing to do about it. */
export type GithubReadiness =
  /** `via: 'acryl'`: the connection made with ACRYL's own sign-in (shared with Control Center), which the person can disconnect; absent: gh's own login or the person's own token. */
  | { readonly status: 'ready'; readonly account: string; readonly via?: 'acryl' }
  | { readonly status: 'signed-out'; readonly say: string; readonly command: string }
  | { readonly status: 'missing'; readonly say: string; readonly link: string }
  | { readonly status: 'unavailable'; readonly say: string }

/** Where connecting GitHub from the app is (`./github-connect.ts`). */
export type GithubConnectState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'code'; readonly code: string; readonly url: string }
  | { readonly status: 'connected' }
  | { readonly status: 'failed'; readonly say: string; readonly details?: string }

/** @throws when the value is not a connect state. */
export function parseGithubConnectState(value: unknown): GithubConnectState {
  if (!isRecord(value)) throw new Error('github connect: not a state')
  if (value.status === 'idle' || value.status === 'starting' || value.status === 'connected') return { status: value.status }
  if (value.status === 'code' && typeof value.code === 'string' && typeof value.url === 'string' && value.url.startsWith('https://github.com/')) {
    return { status: 'code', code: value.code, url: value.url }
  }
  if (value.status === 'failed' && typeof value.say === 'string') {
    return { status: 'failed', say: value.say, ...(typeof value.details === 'string' ? { details: value.details } : {}) }
  }
  throw new Error('github connect: not a state')
}

/** @throws when the value is not a GitHub readiness. */
export function parseGithubReadiness(value: unknown): GithubReadiness {
  if (!isRecord(value)) throw new Error('github: not a readiness')
  if (value.status === 'ready' && typeof value.account === 'string') return { status: 'ready', account: value.account, ...(value.via === 'acryl' ? { via: 'acryl' as const } : {}) }
  if (value.status === 'signed-out' && typeof value.say === 'string' && typeof value.command === 'string') return { status: 'signed-out', say: value.say, command: value.command }
  if (value.status === 'missing' && typeof value.say === 'string' && typeof value.link === 'string') return { status: 'missing', say: value.say, link: value.link }
  if (value.status === 'unavailable' && typeof value.say === 'string') return { status: 'unavailable', say: value.say }
  throw new Error('github: not a readiness')
}
