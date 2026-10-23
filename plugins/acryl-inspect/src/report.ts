/**
 * The per-plugin contract, read from the running system (spec 046, M4). Cordis already knows a plugin's name, its state, the
 * services it requires (`inject`) and a labeled tree of everything it registered (`getEffects()`), so there is no second
 * declaration to keep in step with the code. The only convention is the label: an effect says what it is, prefixed by its
 * owner (`acryl-router: GET /a`). Pure functions over a structural view of a fiber, so they are testable without Cordis.
 */

/** The plugin states Cordis defines, by their numeric values (`FiberState`). */
const STATE_NAMES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'DISPOSED', 'UNLOADING'] as const
export type FiberStateName = typeof STATE_NAMES[number]

export interface EffectLabel {
  readonly label: string
  readonly children: readonly EffectLabel[]
}

/** The slice of a Cordis fiber this module reads. */
export interface FiberView {
  readonly state: number
  readonly inject: Readonly<Record<string, unknown>>
  readonly runtime: { readonly name?: string | undefined } | null
  /** The context the fiber was loaded from; its own `fiber` is the owning plugin when this fiber is an inline `ctx.inject(...)` callback. */
  readonly parent?: { readonly fiber?: FiberView | undefined } | undefined
  getEffects(): readonly EffectLabel[]
}

export interface RouteReport {
  readonly method: string
  readonly path: string
}

export interface PluginReport {
  readonly name: string
  readonly state: FiberStateName
  /** Services the plugin waits for before it starts. */
  readonly requires: readonly string[]
  /** Services it provides. */
  readonly provides: readonly string[]
  /** Routes it registered on the router. */
  readonly routes: readonly RouteReport[]
  /** Router middleware paths it registered. */
  readonly middleware: readonly string[]
  /** Every other labeled registration (event listeners, timers, commands, tools). */
  readonly other: readonly string[]
  /** How many registrations disappear when it unloads: all of them. */
  readonly removedOnUnload: number
}

const PROVIDE = /^ctx\.provide\("(.+)"\)$/
const ROUTE = /^acryl-router: (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|\*) (\/\S*)$/
const USE = /^acryl-router: use (\/\S*)$/

function flatten(effects: readonly EffectLabel[]): string[] {
  return effects.flatMap(effect => [effect.label, ...flatten(effect.children)])
}

export function stateName(state: number): FiberStateName {
  return STATE_NAMES[state] ?? 'FAILED'
}

const isNamed = (fiber: FiberView): boolean => (fiber.runtime?.name ?? '') !== ''

/** The named plugin a fiber belongs to: itself, or for an unnamed inline callback (`ctx.inject([...], inner => ...)`) the nearest named ancestor. */
export function ownerOf(fiber: FiberView): FiberView {
  let current = fiber
  while (!isNamed(current)) {
    const parent = current.parent?.fiber
    if (parent === undefined || parent === current) return fiber
    current = parent
  }
  return current
}

/** Describe one fiber, counting the registrations of the unnamed inline callbacks it owns (`adopted`) as its own. */
export function reportFiber(fiber: FiberView, adopted: readonly FiberView[] = []): PluginReport {
  const provides: string[] = []
  const routes: RouteReport[] = []
  const middleware: string[] = []
  const other: string[] = []
  const labels = [fiber, ...adopted].flatMap(source => flatten(source.getEffects()))
  for (const label of labels) {
    const provided = PROVIDE.exec(label)
    const route = ROUTE.exec(label)
    const used = USE.exec(label)
    if (provided?.[1] !== undefined) provides.push(provided[1])
    else if (route?.[1] !== undefined && route[2] !== undefined) routes.push({ method: route[1], path: route[2] })
    else if (used?.[1] !== undefined) middleware.push(used[1])
    else other.push(label)
  }
  return {
    name: isNamed(fiber) ? fiber.runtime?.name ?? 'anonymous' : 'anonymous',
    state: stateName(fiber.state),
    requires: Object.keys(fiber.inject).sort(),
    provides: provides.sort(),
    routes,
    middleware,
    other,
    removedOnUnload: labels.length,
  }
}

const list = (items: readonly string[]): string => items.length === 0 ? 'nothing' : items.join(', ')

/** A short, human explanation of one plugin: what it needs, what it adds, and what happens when it unloads. */
export function explain(report: PluginReport): string {
  const lines = [
    `${report.name} (${report.state})`,
    `  needs:     ${list(report.requires)}`,
    `  provides:  ${list(report.provides)}`,
    `  routes:    ${list(report.routes.map(route => `${route.method} ${route.path}`))}`,
    `  middleware:${report.middleware.length === 0 ? ' nothing' : ` ${report.middleware.join(', ')}`}`,
  ]
  if (report.other.length > 0) lines.push(`  also:      ${report.other.join('; ')}`)
  lines.push(report.state === 'PENDING'
    ? `  waiting:   it starts when ${list(report.requires)} ${report.requires.length === 1 ? 'is' : 'are'} available`
    : `  unloading: removes ${String(report.removedOnUnload)} registration${report.removedOnUnload === 1 ? '' : 's'} and nothing else`)
  return lines.join('\n')
}

/** One block per plugin, in registration order. */
export function renderReports(reports: readonly PluginReport[]): string {
  return reports.map(explain).join('\n\n')
}
