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
export const LAUNCHER_BLENDS_PATH = `${LAUNCHER_API_PREFIX}/blends`
export const LAUNCHER_ASSISTANT_FOLDER_PATH = `${LAUNCHER_API_PREFIX}/assistant-folder`
export const LAUNCHER_PLUGINS_PATH = `${LAUNCHER_API_PREFIX}/plugins`
export const LAUNCHER_PLUGIN_PULL_PATH = `${LAUNCHER_API_PREFIX}/plugin-pull`
export const LAUNCHER_PUBLISH_PLAN_PATH = `${LAUNCHER_API_PREFIX}/publish-plan`
export const LAUNCHER_PUBLISH_PATH = `${LAUNCHER_API_PREFIX}/publish`

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
  /** Why the app stopped on its own, when it did (the last lines it printed). */
  readonly failure?: string
}

export interface StarterView {
  readonly value: string
  readonly label: string
  readonly description: string
}

/** The one app the screen is making right now (making an app installs it, about a minute). */
export interface JobView {
  readonly name: string
  /** The line a person types to do the same. */
  readonly line: string
  readonly status: 'running' | 'done' | 'failed'
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
}

export interface BlendsResponse {
  readonly blends: readonly BlendView[]
}

/** A Blend id as `acryl new --from` takes it: it starts with a letter or digit, so it can never read as an option. */
export const BLEND_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u

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

/** A plugin name, a GitHub account and a license id as the door takes them: nothing that could read as an option or a path. */
export const PLUGIN_NAME = /^[a-z0-9][a-z0-9._-]{0,127}$/u
export const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u
export const LICENSE_ID = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/u

/** The folder the assistant's agent works in: the apps folder, made if it was not there yet. */
export interface AssistantFolderResponse {
  readonly folder: string
}
