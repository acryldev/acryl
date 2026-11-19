/**
 * Which routes a plugin brings, and whether one of them is already served (spec 049 T025). Plugins that do not know each other share one app: the router
 * serves the first mount of a route and ignores the second without a word, so a plugin whose route is taken would look installed and answer nothing.
 * The router labels each route it serves (`acryl-router: serves GET /notes`, under the mount's effect), so the routes are read from the running system.
 * Pure functions over those labels; the service reads them from the registry.
 */

/** One route as the router serves it. */
export interface ServedRoute {
  readonly method: string
  readonly path: string
  /** The plugin whose fiber holds the label. */
  readonly owner: string
}

/** The slice of a Cordis effect this module reads. */
export interface EffectView {
  readonly label: string
  readonly children: readonly EffectView[]
}

/** The slice of a Cordis fiber this module reads. */
export interface FiberRoutesView {
  readonly runtime: { readonly name?: string | undefined } | null
  getEffects(): readonly EffectView[]
}

const SERVES = /^acryl-router: serves ([A-Z]+) (\S+)$/u

/** Every route served by the given fibers, with the plugin that holds each. `ALL` is middleware or `all`, which wraps routes rather than taking them. */
export function servedRoutes(fibers: Iterable<FiberRoutesView>): ServedRoute[] {
  const routes: ServedRoute[] = []
  const walk = (effects: readonly EffectView[], owner: string): void => {
    for (const effect of effects) {
      const served = SERVES.exec(effect.label)
      if (served?.[1] !== undefined && served[2] !== undefined && served[1] !== 'ALL')
        routes.push({ method: served[1], path: served[2], owner })
      walk(effect.children, owner)
    }
  }
  for (const fiber of fibers) walk(fiber.getEffects(), fiber.runtime?.name ?? '')
  return routes
}

const key = (route: ServedRoute): string => `${route.method} ${route.path}`

/** The routes in `after` that `before` did not have: what one mount added, counted, so a second mount of the same route counts as added. */
export function addedRoutes(
  before: readonly ServedRoute[],
  after: readonly ServedRoute[],
): ServedRoute[] {
  const left = new Map<string, number>()
  for (const route of before) left.set(key(route), (left.get(key(route)) ?? 0) + 1)
  const added: ServedRoute[] = []
  for (const route of after) {
    const count = left.get(key(route)) ?? 0
    if (count > 0) left.set(key(route), count - 1)
    else added.push(route)
  }
  return added
}

const segments = (path: string): string[] => path.split('/').filter((part) => part !== '')

/**
 * Whether one request could match both paths: equal segments, a `:param` matching any one segment, a `*` matching the rest. `/notes` and `/notes/list` are
 * two routes; `/notes/*` and `/notes/list` are not.
 */
export function pathsOverlap(a: string, b: string): boolean {
  const x = segments(a)
  const y = segments(b)
  for (let i = 0; ; i += 1) {
    const p = x[i]
    const q = y[i]
    if (p === '*' || q === '*') return true
    if (p === undefined || q === undefined) return p === q
    if (p.startsWith(':') || q.startsWith(':')) continue
    if (p !== q) return false
  }
}

/** The first route `added` shares with one already served: same method and an overlapping path. */
export function routeClash(
  added: readonly ServedRoute[],
  served: readonly ServedRoute[],
): { readonly route: ServedRoute; readonly taken: ServedRoute } | undefined {
  for (const route of added)
    for (const taken of served)
      if (taken.method === route.method && pathsOverlap(taken.path, route.path))
        return { route, taken }
  return undefined
}
