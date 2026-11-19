/**
 * The Blueprint vocabulary of ACRYL's coding capabilities: which capability ids exist, which product surfaces each one declares itself for,
 * and which of them need the framework router. Blueprint parsing and the built-in IDE Blueprint are runtime domain and read this table.
 *
 * How a capability composes on a surface (its Loader rows, the packages the surface must make resolvable, the shell-mode split) lives in
 * `@acryldev/coding-capabilities`, which the surfaces compose from: the runtime decides what a Blueprint may name, the surface decides what
 * runs. The two tables must name the same ids; the composition package's test asserts it both ways (spec 051 T021).
 *
 * @module acryl-harness-runtime/coding-capabilities
 */

export type AcrylSurface = 'tui' | 'web' | 'desktop'

export type AcrylCodingCapabilityId =
  | 'persona'
  | 'agent-roster'
  | 'session-stats'
  | 'authorization'
  | 'acryl-settings'
  | 'workspace'
  | 'plugin-admin'
  | 'sign-in'
  | 'launcher-screen'
  | 'account-callback'
  | 'support'
  | 'agent-control-ui'
  | 'advanced-shell'

/**
 * The shell a surface renders the coding UI in. `advanced` replaces the stock DSH frame with the ACRYL
 * shell (Projects list, tabbed canvas, right panel); `compatibility` keeps the stock frame. Desktop lets
 * the user choose; Web always runs `advanced`, so both surfaces share one workspace.
 */
export type AcrylShellMode = 'compatibility' | 'advanced'

/** One capability as a Blueprint names it. Its composition (rows and packages) is `@acryldev/coding-capabilities`'. */
export interface AcrylCodingCapabilityDeclaration {
  readonly id: AcrylCodingCapabilityId
  /**
   * The capability serves its HTTP through the framework's router (`ctx.router`, `ctx.routerHttp`), which the `framework-kit` row brings.
   * Without that row its plugin waits PENDING with nothing said, so a Blueprint that composes it must also compose the kit.
   */
  readonly needsRouter?: boolean
}

/** Every capability a Blueprint may name, and which of them need the framework router. */
export const ACRYL_CODING_CAPABILITIES: readonly AcrylCodingCapabilityDeclaration[] = [
  { id: 'persona' },
  { id: 'agent-roster' },
  { id: 'session-stats' },
  { id: 'authorization' },
  { id: 'acryl-settings' },
  { id: 'workspace', needsRouter: true },
  { id: 'plugin-admin', needsRouter: true },
  { id: 'sign-in', needsRouter: true },
  { id: 'launcher-screen', needsRouter: true },
  { id: 'account-callback' },
  { id: 'support', needsRouter: true },
  { id: 'agent-control-ui', needsRouter: true },
  { id: 'advanced-shell' },
]
