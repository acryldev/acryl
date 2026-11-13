/** What the screen shows, worked out from the Host's list: pure functions, no DOM (Clean Code: the view only draws these). */
import type { AppView, Surface } from '../contract.ts'

export type SurfaceFilter = 'all' | Surface

export interface Tiles {
  readonly apps: number
  readonly running: number
  /** Updates are not checked yet (spec 050 T011 lists it as not built): the tile says 0 and the nav shows no number. */
  readonly updates: number
  /** Deploying to WebBoxes.ai is not built yet (`acryl deploy`). */
  readonly cloud: number
}

export const tilesOf = (apps: readonly AppView[]): Tiles => ({
  apps: apps.length,
  running: apps.filter(app => app.state === 'running' || app.state === 'starting').length,
  updates: 0,
  cloud: 0,
})

/** The apps a search and a surface filter leave: the search matches the name, the Blend and the folder, in any case. */
export function visibleApps(apps: readonly AppView[], search: string, surface: SurfaceFilter): readonly AppView[] {
  const needle = search.trim().toLowerCase()
  return apps.filter(app => (surface === 'all' || app.surface === surface)
    && (needle === '' || `${app.name} ${app.blend} ${app.path}`.toLowerCase().includes(needle)))
}

export const SURFACE_LABEL: Readonly<Record<Surface, string>> = { web: 'Web', desktop: 'Desktop', tui: 'CLI (TUI)' }

/** Why a surface cannot be chosen yet, or undefined when it can. */
export const surfaceNote = (surface: Surface): string | undefined => surface === 'tui' ? 'coming' : undefined

const COLORS = ['#3652D9', '#0f766e', '#be123c', '#0369A1', '#a16207', '#7c2d12', '#334155'] as const

/** A steady color for an app's icon, from its id, so it does not change between visits. */
export function iconColor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return COLORS[hash % COLORS.length]!
}

export const initial = (name: string): string => (name.trim()[0] ?? '?').toUpperCase()

/** The line a person types to start the app in a terminal: shown on the card's panel as "Runs". */
export const runsLine = (app: AppView): string => `cd ${app.path} && npm run ${app.surface === 'desktop' ? 'desktop' : 'dev'}`

/** A name for an app made from a registry id: its last part (`acrylblends.notes-desktop` gives `notes-desktop`), the same rule as the terminal's. */
export const blendAppName = (id: string): string => id.split('.').at(-1)?.replace(/[^a-z0-9-]/gu, '-').replace(/^[^a-z]+/u, '') || 'my-app'
