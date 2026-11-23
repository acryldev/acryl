/** The wire contract of the ACRYL screen's routes (the desktop face of the launcher, spec 050 T012). The screen is the client of these routes. */

/** Every launcher route lives under this prefix, the one the Host's Web adapter mounts for this plugin. */
export const LAUNCHER_API_PREFIX = '/api/acryl-launcher'
export const LAUNCHER_STATE_PATH = `${LAUNCHER_API_PREFIX}/state`
export const LAUNCHER_HEALTH_PATH = `${LAUNCHER_API_PREFIX}/health`
export const LAUNCHER_ADD_PATH = `${LAUNCHER_API_PREFIX}/add`
export const LAUNCHER_REMOVE_PATH = `${LAUNCHER_API_PREFIX}/remove`
export const LAUNCHER_NEW_PATH = `${LAUNCHER_API_PREFIX}/new`
export const LAUNCHER_START_PATH = `${LAUNCHER_API_PREFIX}/start`
export const LAUNCHER_STOP_PATH = `${LAUNCHER_API_PREFIX}/stop`
export const LAUNCHER_UPDATE_PATH = `${LAUNCHER_API_PREFIX}/update`
/** Open ACRYL ADE (the Blend `acryl.ade` in `<home>/ade`, the folder `acryl ade` uses), made on first use, in a window or the browser. */
export const LAUNCHER_ADE_PATH = `${LAUNCHER_API_PREFIX}/ade`
export const LAUNCHER_BLENDS_PATH = `${LAUNCHER_API_PREFIX}/blends`
export const LAUNCHER_ASSISTANT_FOLDER_PATH = `${LAUNCHER_API_PREFIX}/assistant-folder`
export const LAUNCHER_PLUGINS_PATH = `${LAUNCHER_API_PREFIX}/plugins`
export const LAUNCHER_PLUGIN_PULL_PATH = `${LAUNCHER_API_PREFIX}/plugin-pull`
export const LAUNCHER_PUBLISH_PLAN_PATH = `${LAUNCHER_API_PREFIX}/publish-plan`
export const LAUNCHER_PUBLISH_PATH = `${LAUNCHER_API_PREFIX}/publish`
export const LAUNCHER_SHARE_PLAN_PATH = `${LAUNCHER_API_PREFIX}/share-plan`
export const LAUNCHER_SHARE_PATH = `${LAUNCHER_API_PREFIX}/share`
export const LAUNCHER_GITHUB_PATH = `${LAUNCHER_API_PREFIX}/github`
export const LAUNCHER_GITHUB_START_PATH = `${LAUNCHER_API_PREFIX}/github-start`
export const LAUNCHER_GITHUB_POLL_PATH = `${LAUNCHER_API_PREFIX}/github-poll`
export const LAUNCHER_GITHUB_DISCONNECT_PATH = `${LAUNCHER_API_PREFIX}/github-disconnect`

/** The three kinds of app (spec 050 D10): a web app, a desktop window, and the lightest, a terminal app, which is listed but not yet made. */
export type Surface = 'web' | 'desktop' | 'tui'
export const SURFACES: readonly Surface[] = ['web', 'desktop', 'tui']
/** Surfaces a person can choose for a new app today. */
export const MAKEABLE_SURFACES: readonly Surface[] = ['web', 'desktop']

/** `starting` is a started app that has not printed its address yet; `missing` is a listed app whose folder is gone. */
export type AppRunState = 'running' | 'starting' | 'stopped' | 'missing'

export interface AppView {
  readonly id: string
  /** The folder's name: what a person calls the app. */
  readonly name: string
  readonly path: string
  readonly blend: string
  readonly madeBy: 'person' | 'agent'
  readonly surface: Surface
  readonly state: AppRunState
  /** Where a running web app answers, with the token it printed. */
  readonly address?: string
  /** While the app is starting: the last lines it printed, live. */
  readonly output?: string
  /** Why the app stopped on its own, when it did (the last lines it printed). */
  readonly failure?: string
  /** The version of the Blend it was made from (its blend.yaml), when it records one. */
  readonly version?: string
  /** A newer release of that Blend in the registry: `acrylblends update` brings it in, keeping the person's changes. */
  readonly update?: string
  /** Where the app was shared to (`https://github.com/<owner>/<repo>`), from its origin remote; what WebBoxes.ai deploys from. */
  readonly github?: string
}

/** WebBoxes.ai's New WebBox form, opened with the app's repository filled in (the person signs in and presses Create there). */
export function webboxesDeployUrl(github: string, name: string): string {
  const url = new URL(WEBBOXES_NEW_BOX)
  url.searchParams.set('github', github)
  url.searchParams.set('name', name.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40))
  return url.href
}

/**
 * WebBoxes.ai's New WebBox form for a store Blend: with `?blend=<id>` the form opens on that registry Blend (the person signs in and presses
 * Create there). A community Blend that lives on GitHub rather than in the registry (`source` is `github:owner/repo#tag`) deploys from its
 * repository, as a shared app does.
 */
export function webboxesDeployBlendUrl(blend: { readonly id: string, readonly source?: string | undefined }): string {
  const name = (blend.id.split('.').pop() ?? blend.id).toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40)
  const repository = /^github:([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+)(?:#.*)?$/u.exec(blend.source ?? '')
  if (repository?.[1] !== undefined) return webboxesDeployUrl(`https://github.com/${repository[1]}`, name)
  const url = new URL(WEBBOXES_NEW_BOX)
  url.searchParams.set('blend', blend.id)
  url.searchParams.set('name', name)
  return url.href
}

export interface StarterView {
  readonly value: string
  readonly label: string
  readonly description: string
}

/** The one app the screen is making right now (making an app installs it, about a minute). */
export interface JobView {
  readonly name: string
  /** Making a new app, or updating one from its Blend's newer release. */
  readonly kind: 'make' | 'update'
  /** The line a person types to do the same. */
  readonly line: string
  readonly status: 'running' | 'done' | 'failed'
  /** Which step it is on and what comes next, e.g. "Step 2 of 3: installing its dependencies (npm install). Next: starting it." */
  readonly step: string
  /** When the job began (ms since epoch), so the screen can show how long it has run. */
  readonly since: number
  /** The last lines the current step printed, live. */
  readonly output: string
  readonly message?: string
}

export interface StateResponse {
  readonly apps: readonly AppView[]
  /** Where "+ New app" suggests putting a new app (a visible folder next to ACRYL's hidden home). */
  readonly appsFolder: string
  readonly starters: readonly StarterView[]
  readonly job: JobView | null
}

export interface HealthView {
  /** `undefined` when the command was not found on this machine. */
  readonly node?: string
  readonly npm?: string
  /** The model key is saved once for every app (`acryl model`). */
  readonly modelKey: boolean
  readonly home: string
}

/** A Blend in the public registry (acrylblends.github.io/registry/index.json) that `acryl new --from <id>` can make an app from. */
export interface BlendView {
  /** `acrylblends.notes`: what `--from` takes. */
  readonly id: string
  readonly name: string
  readonly version: string
  readonly category: string
  readonly description: string
  /** Who released it: the ACRYL project (`official`) or anyone else (`community`, not reviewed); the registry's `origin`. */
  readonly origin: 'official' | 'community'
  /** A community Blend's release on GitHub (`github:owner/repo#tag`), what `--from` takes for a Blend outside the public registry; absent: `--from <id>`. */
  readonly source?: string
  /** A community Blend's GitHub owner, shown as "by @owner". */
  readonly publisher?: string
  /** Where the store files it (the registry's placement.json): its category and subcategory; `order` is the category's place in the store's list. */
  readonly place?: BlendPlace
  /** Its page on the store (https), when the registry names one. */
  readonly page?: string
  /** A picture of its first page (https), when the Blend has one. */
  readonly screenshot?: string
}

export interface BlendPlace {
  readonly category: string
  readonly subcategory: string
  readonly order: number
}

export interface BlendsResponse {
  readonly blends: readonly BlendView[]
}

/** A Blend id as `acryl new --from` takes it: it starts with a letter or digit, so it can never read as an option. */
/** WebBoxes.ai's WebBoxes page: with `github` (a public https://github.com/owner/repo) and `name` it opens the New WebBox form filled in. */
export const WEBBOXES_NEW_BOX = 'https://webboxes.ai/dashboard/webboxes'

export const BLEND_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u

/** A Blend released on GitHub, as `--from` takes it (create-acrylblends `github:owner/repo#ref`): what a community Blend is made from. */
export const BLEND_SOURCE = /^github:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}(?:#[A-Za-z0-9._/-]{1,100})?$/u

/** The app to make: from a starter (`acryl new <name> <starter>`) or from a registry Blend (`acryl new <name> --from <id>`), never both. */
export interface NewAppRequest {
  readonly where: string
  readonly name: string
  readonly starter?: string
  readonly blend?: string
  readonly surface: Surface
}

/** A plugin of a running app, as the app's door lists it: one the app's own people made, or one pulled from a registry (`pulledFrom`). */
export interface PluginView {
  readonly name: string
  readonly version: string
  readonly state: string
  /** `github:owner/repo@version` when it was pulled; absent for a plugin made in the app (the ones that can be shared). */
  readonly pulledFrom?: string
  readonly author?: string
}

export interface PluginsResponse {
  readonly plugins: readonly PluginView[]
}

/** What pulling a plugin did, in the door's words. */
export interface PluginPullResponse {
  readonly text: string
  readonly plugins: readonly PluginView[]
}

/** What publishing a plugin would send, read without sending anything: the person reads this before saying yes. */
export interface PublishPlanView {
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly visibility: string
  readonly license: string
  readonly createsRepository: boolean
  readonly files: readonly string[]
  readonly integrity: string
  readonly digest: string
  /** The line a friend pulls it with. */
  readonly pullLine: string
}

export interface PublishPlanRequest {
  readonly id: string
  readonly plugin: string
  /** The account that owns the repository; absent means the signed-in one. */
  readonly owner?: string
  readonly license?: string
}

/** The person's yes: the plan they read, sent back as it was. */
export interface PublishRequest extends PublishPlanRequest {
  readonly plan: PublishPlanView
}

export interface PublishResponse {
  readonly releaseUrl: string
  readonly pullLine: string
}

/** What sharing a whole app would send, in the app's own words (`npm run share -- --json`): the person reads this before saying yes. */
export interface AppSharePlanView {
  /** `owner/name` for a repository the share creates, or the address of the remote the app already has. */
  readonly repository: string
  readonly create: boolean
  readonly visibility: 'private' | 'public'
  /** Files changed since the app's last save; the share saves them first. */
  readonly changes: number
}

export interface AppSharePlanRequest {
  readonly id: string
  /** The account that owns a new repository; absent means the signed-in one. */
  readonly owner?: string
  /** Who may see it: written to the app's blend.yaml (metadata.visibility, the one place it is kept) before the plan is read; absent keeps it. */
  readonly visibility?: 'private' | 'public'
}

/** The GitHub connection Control Center hands its apps (as GH_TOKEN): who is signed in, never the token. */
export interface GithubView {
  /** False when this build has no GitHub app to sign in with. */
  readonly available: boolean
  readonly login: string | null
}

/** A sign-in under way: the code the person types at GitHub. The device code stays in the service. */
export interface GithubStartView {
  readonly userCode: string
  readonly verificationUri: string
  /** Seconds between polls. */
  readonly interval: number
}

export type GithubPollView =
  | { readonly state: 'pending', readonly interval?: number }
  | { readonly state: 'connected', readonly login: string }
  | { readonly state: 'failed', readonly reason: string }

/** The person's yes: the plan they read, sent back as it was. */
export interface AppShareRequest extends AppSharePlanRequest {
  readonly plan: AppSharePlanView
}

export interface AppShareResponse {
  /** The remote the app now pushes to. */
  readonly remote: string
  readonly created: boolean
}

/** A plugin name, a GitHub account and a license id as the door takes them: nothing that could read as an option or a path. */
export const PLUGIN_NAME = /^[a-z0-9][a-z0-9._-]{0,127}$/u
export const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u
export const LICENSE_ID = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/u

/** The folder the assistant's agent works in: the apps folder, made if it was not there yet. */
export interface AssistantFolderResponse {
  readonly folder: string
}
