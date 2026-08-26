/** Bounded projection of native Cordis Fibers, services, injects, and effects. */

import type { Context, EffectMeta, Fiber, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {
  CordisDependencyView,
  CordisEffectView,
  CordisFiberView,
  CordisPlane,
  CordisPlaneSnapshot,
  CordisServiceView,
} from './plugin-architecture-contract.ts'
import type { PluginLifecycleFiberPhase } from './plugin-lifecycle-contract.ts'

const MAX_FIBERS = 2_048
const MAX_SERVICES = 4_096
const MAX_EFFECTS_PER_FIBER = 512
const MAX_EFFECT_DEPTH = 12
const MAX_LABEL_LENGTH = 512

const FIBER_PHASE = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
} as const satisfies Record<FiberState, PluginLifecycleFiberPhase>

interface LoaderInspection {
  locate(fiber: Fiber): string | undefined
}

function phaseOf(fiber: Fiber): Exclude<PluginLifecycleFiberPhase, null> {
  return FIBER_PHASE[fiber.state] ?? 'pending'
}

function effectView(meta: EffectMeta, depth: number, budget: { remaining: number }): CordisEffectView {
  if (depth > MAX_EFFECT_DEPTH) throw new Error('Cordis effect tree exceeds the inspection depth limit')
  if (--budget.remaining < 0) throw new Error('Cordis Fiber exceeds the inspection effect limit')
  if (typeof meta.label !== 'string' || meta.label.length > MAX_LABEL_LENGTH) {
    throw new Error('Cordis effect label exceeds the inspection limit')
  }
  return Object.freeze({
    label: meta.label,
    children: Object.freeze(meta.children.map(child => effectView(child, depth + 1, budget))),
  })
}

function liveServices(ctx: Context): Array<{ name: string; fiber: Fiber }> {
  const store = ctx.root.reflect.store
  return Object.getOwnPropertySymbols(store)
    .map(key => store[key])
    .filter((impl): impl is NonNullable<typeof impl> => impl !== undefined && impl.fiber.uid !== null)
}

function fibers(ctx: Context): Fiber[] {
  const found = new Set<Fiber>([ctx.root.fiber])
  for (const runtime of ctx.root.registry.values()) {
    for (const fiber of runtime.fibers) {
      if (fiber.uid !== null) found.add(fiber)
    }
  }
  const result = [...found].sort((left, right) => (left.uid ?? 0) - (right.uid ?? 0))
  if (result.length > MAX_FIBERS) throw new Error('Cordis context exceeds the inspection Fiber limit')
  return result
}

function dependencyView(fiber: Fiber, name: string): CordisDependencyView {
  const resolved = fiber.store?.[name]
  if (resolved !== undefined && resolved.fiber.uid !== null) {
    return Object.freeze({ name, status: 'resolved', providerFiberUid: resolved.fiber.uid })
  }
  return Object.freeze({
    name,
    status: fiber.ctx.get(name) === undefined ? 'missing' : 'available',
    providerFiberUid: null,
  })
}

function moduleName(fiber: Fiber): string | null {
  return fiber.entry?.options.name ?? null
}

/** Inspect one Cordis context without caching or inventing cross-plane identity. */
export function inspectCordisContext(ctx: Context, plane: CordisPlane): CordisPlaneSnapshot {
  const allFibers = fibers(ctx)
  const services = liveServices(ctx)
  if (services.length > MAX_SERVICES) throw new Error('Cordis context exceeds the inspection service limit')
  const servicesByFiber = new Map<Fiber, string[]>()
  for (const impl of services) {
    const names = servicesByFiber.get(impl.fiber) ?? []
    names.push(impl.name)
    servicesByFiber.set(impl.fiber, names)
  }
  const loader = ctx.get('loader') as LoaderInspection | undefined
  const fiberViews: CordisFiberView[] = allFibers.map((fiber) => {
    const parent = fiber.parent.fiber
    const budget = { remaining: MAX_EFFECTS_PER_FIBER }
    return Object.freeze({
      uid: fiber.uid ?? 0,
      name: fiber.name,
      phase: phaseOf(fiber),
      parentUid: parent === fiber ? null : parent.uid,
      loaderEntryId: loader?.locate(fiber) ?? null,
      moduleName: moduleName(fiber),
      dependencies: Object.freeze(
        Object.keys(fiber.inject).sort().map(name => dependencyView(fiber, name)),
      ),
      providedServices: Object.freeze([...(servicesByFiber.get(fiber) ?? [])].sort()),
      effects: Object.freeze(fiber.getEffects().map(meta => effectView(meta, 0, budget))),
    })
  })
  const serviceViews: CordisServiceView[] = services
    .map(impl => Object.freeze({
      name: impl.name,
      providerFiberUid: impl.fiber.uid ?? 0,
      providerName: impl.fiber.name,
      providerPhase: phaseOf(impl.fiber),
    }))
    .sort((left, right) => left.name.localeCompare(right.name)
      || left.providerFiberUid - right.providerFiberUid)
  return Object.freeze({
    plane,
    fibers: Object.freeze(fiberViews),
    services: Object.freeze(serviceViews),
  })
}
