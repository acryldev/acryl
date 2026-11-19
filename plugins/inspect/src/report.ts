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
  /** Paths it mounted an app under on the router. */
  readonly mounts: readonly string[]
  /** What those mounts serve; middleware and `all` routes show as method `ALL`, the way the core keeps them. */
  readonly routes: readonly RouteReport[]
  /** Every other labeled registration (event listeners, timers, commands, tools). */
  readonly other: readonly string[]
  /** How many registrations disappear when it unloads: all of them. */
  readonly removedOnUnload: number
}

const PROVIDE = /^ctx\.provide\("(.+)"\)$/
const MOUNT = /^acryl-router: route (\S+)$/
const SERVES = /^acryl-router: serves ([A-Z]+) (\S+)$/

function flatten(effects: readonly EffectLabel[]): string[] {
  return effects.flatMap(effect => [effect.label, ...flatten(effect.children)])
}

/** A mount's children name the routes it serves; they describe that one registration and are not registrations of their own. */
function routeOf(label: string): RouteReport | undefined {
  const served = SERVES.exec(label)
  return served?.[1] !== undefined && served[2] !== undefined ? { method: served[1], path: served[2] } : undefined
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
  const mounts: string[] = []
  const routes: RouteReport[] = []
  const other: string[] = []
  const labels = [fiber, ...adopted].flatMap(source => flatten(source.getEffects()))
  let registrations = 0
  for (const label of labels) {
    const provided = PROVIDE.exec(label)
    const mount = MOUNT.exec(label)
    const route = routeOf(label)
    if (route !== undefined) { routes.push(route); continue }
    registrations += 1
    if (provided?.[1] !== undefined) provides.push(provided[1])
    else if (mount?.[1] !== undefined) mounts.push(mount[1])
    else other.push(label)
  }
  return {
    name: isNamed(fiber) ? fiber.runtime?.name ?? 'anonymous' : 'anonymous',
    state: stateName(fiber.state),
    requires: Object.keys(fiber.inject).sort(),
    provides: provides.sort(),
    mounts,
    routes,
    other,
    removedOnUnload: registrations,
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
    `  mounts:    ${report.mounts.length === 0 ? 'nothing' : report.mounts.join(', ')}`,
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
