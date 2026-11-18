/**
 * Reading a live Cordis context into a plugin graph: every fiber, the disabled Loader rows, and the relations between them (requires, provides to, nested in).
 * Ported from cordis-plugin-graph (MIT, github.com/cordisplugins/cordis-plugin-graph, commit e9bf6b5, `src/inspect.ts`): the same walk of the public Cordis and
 * Loader API, with a `source` on each node added. It imports nothing from Node, so the Host reads its own context with it and the browser reads the
 * client's (the two planes).
 */
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { EdgeKind, GraphEdge, GraphNode, GraphSnapshot, GraphSource, NodePhase } from './graph-contract.ts'

const MAX_FIBERS = 4096
const MAX_LABEL = 400
export const PHASE: Record<number, NodePhase> = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: 'disposed', 5: 'unloading' }

interface ImplLike { readonly name: string; readonly fiber: Fiber }
interface LoaderLike {
  locate?: (fiber: Fiber) => string | undefined
  entries?: () => Iterable<{
    id?: string
    disabled?: boolean
    fiber?: Fiber
    options?: { name?: string; group?: boolean }
  }>
}

/** Where a node's code is, found from what the Loader entry names; undefined when it cannot be found. */
export type SourceOf = (moduleName: string | null, name: string) => GraphSource | undefined

export const clamp = (value: string): string => (value.length > MAX_LABEL ? `${value.slice(0, MAX_LABEL)}…` : value)
const phaseOf = (fiber: Fiber): NodePhase => PHASE[fiber.state] ?? 'pending'

/** Every live fiber reachable from the context root, root first, uid-ascending. */
function collectFibers(ctx: Context): Fiber[] {
  const found = new Set<Fiber>([ctx.root.fiber])
  for (const runtime of ctx.root.registry.values()) {
    for (const fiber of runtime.fibers) {
      if (fiber.uid !== null) found.add(fiber)
    }
  }
  const result = [...found].sort((a, b) => (a.uid ?? 0) - (b.uid ?? 0))
  if (result.length > MAX_FIBERS) throw new Error('the context has more fibers than the graph shows')
  return result
}

/** Live service implementations in the root reflect store, keyed off `impl.fiber.uid`, so a wrapped fiber never mis-attributes a provider. */
function liveServices(ctx: Context): ImplLike[] {
  const store = ctx.root.reflect.store as Record<string | symbol, ImplLike | undefined>
  return Reflect.ownKeys(store)
    .map(key => store[key])
    .filter((impl): impl is ImplLike => impl != null && typeof impl.name === 'string' && impl.fiber != null && impl.fiber.uid != null)
}

/** The current Cordis graph of `ctx`: every fiber, the disabled Loader rows, and the three kinds of relation. */
export function inspectCordisContext(ctx: Context, plane: string, sourceOf: SourceOf = () => undefined): GraphSnapshot {
  const fibers = collectFibers(ctx)
  const providesByUid = new Map<number, string[]>()
  for (const impl of liveServices(ctx)) {
    const uid = impl.fiber.uid ?? 0
    const list = providesByUid.get(uid) ?? []
    list.push(impl.name)
    providesByUid.set(uid, list)
  }

  const loader = ctx.get('loader') as LoaderLike | undefined
  const uidByEntryId = new Map<string, number>()
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const known = new Set<number>()

  for (const fiber of fibers) {
    const uid = fiber.uid ?? 0
    known.add(uid)
    const parent = fiber.parent.fiber
    const parentUid = parent === fiber ? null : (parent.uid ?? null)
    // A fiber inside another plugin's entry (the plugins an `include` row composes) inherits that entry; it is not the row's own, so it names no module of its
    // own and its code is found by its name instead.
    const ownsEntry = fiber.entry !== undefined && (parent === fiber || parent.entry !== fiber.entry)
    const entryId = ownsEntry ? (loader?.locate?.(fiber) ?? null) : null
    if (entryId !== null) uidByEntryId.set(entryId, uid)
    const moduleName = ownsEntry ? (fiber.entry?.options.name ?? null) : null
    const source = uid === 0 ? undefined : sourceOf(moduleName, fiber.name)
    nodes.push({
      uid,
      name: clamp(fiber.name),
      phase: phaseOf(fiber),
      enabled: true,
      moduleName,
      loaderEntryId: entryId,
      provides: [...(providesByUid.get(uid) ?? [])].sort(),
      effects: fiber.getEffects().map(meta => clamp(meta.label)),
      ...(source === undefined ? {} : { source }),
    })
    if (parentUid !== null && known.has(parentUid)) edges.push({ kind: 'nesting', from: uid, to: parentUid })
    for (const service of Object.keys(fiber.inject).sort()) {
      const impl = fiber.store?.[service] as { fiber?: { uid: number | null } } | undefined
      const providerUid = impl?.fiber?.uid ?? null
      const resolved = providerUid !== null && known.has(providerUid)
      edges.push({ kind: 'inject', from: uid, to: resolved ? providerUid : uid, service, resolved })
      if (resolved && providerUid !== uid) edges.push({ kind: 'provider', from: providerUid, to: uid, service })
    }
  }

  // Disabled and not-yet-mounted Loader rows: the whole composition, not only what runs. A row with a live fiber is already covered above.
  let synthetic = -1
  if (typeof loader?.entries === 'function') {
    for (const entry of loader.entries()) {
      if (entry?.options?.group) continue
      const id = typeof entry.id === 'string' ? entry.id : null
      if (id !== null && uidByEntryId.has(id)) continue
      const fiberUid = entry.fiber?.uid ?? null
      if (fiberUid !== null && known.has(fiberUid)) continue
      const disabled = entry.disabled === true
      const moduleName = entry.options?.name ?? null
      const source = moduleName === null ? undefined : sourceOf(moduleName, moduleName)
      nodes.push({
        uid: fiberUid ?? synthetic--,
        name: clamp(moduleName ?? id ?? 'unknown'),
        phase: disabled ? 'disabled' : (entry.fiber ? phaseOf(entry.fiber) : 'pending'),
        enabled: !disabled,
        moduleName,
        loaderEntryId: id,
        provides: [],
        effects: [],
        ...(source === undefined ? {} : { source }),
      })
    }
  }
  return { capturedAt: new Date().toISOString(), plane, nodes, edges }
}

/** The relation kinds, for the browser's toggles. */
export const EDGE_KINDS: readonly EdgeKind[] = ['inject', 'provider', 'nesting']

