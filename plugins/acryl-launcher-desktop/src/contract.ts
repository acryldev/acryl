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
