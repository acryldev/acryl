/** Bounded, host-neutral projection of native Cordis runtime state. */

import type { Context, EffectMeta, Fiber } from '@deepseek-ai/cordis'

const MAX_FIBERS = 2_048
const MAX_SERVICES = 4_096
const MAX_EFFECTS_PER_FIBER = 512
const MAX_EFFECT_DEPTH = 12
const MAX_LABEL_LENGTH = 512

export type ArchitecturePlane = 'host' | 'client' | 'tui'

export type ArchitectureFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'

export type ArchitectureDependencyStatus = 'resolved' | 'available' | 'missing'

/** One currently owned, labeled Cordis effect and its nested ownership. */
export interface ArchitectureEffectView {
  readonly label: string
  readonly children: readonly ArchitectureEffectView[]
}

/** One native `inject` declaration and its current resolution state. */
export interface ArchitectureDependencyView {
  readonly name: string
  readonly status: ArchitectureDependencyStatus
  readonly providerFiberUid: number | null
}

/** One live Cordis Fiber. Repeated mounts remain distinct by UID. */
export interface ArchitectureFiberView {
  readonly uid: number
  readonly name: string
  readonly phase: ArchitectureFiberPhase
  readonly parentUid: number | null
  readonly loaderEntryId: string | null
  readonly moduleName: string | null
  readonly dependencies: readonly ArchitectureDependencyView[]
  readonly providedServices: readonly string[]
  readonly effects: readonly ArchitectureEffectView[]
}

/** One live service implementation and its owning Fiber. */
export interface ArchitectureServiceView {
  readonly name: string
  readonly providerFiberUid: number
  readonly providerName: string
  readonly providerPhase: ArchitectureFiberPhase
}

/** Point-in-time native graph for one independent Cordis context. */
export interface RuntimeArchitectureSnapshot {
  readonly plane: ArchitecturePlane
  readonly fibers: readonly ArchitectureFiberView[]
  readonly services: readonly ArchitectureServiceView[]
}

const FIBER_PHASE: Record<number, ArchitectureFiberPhase | null> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

interface LoaderInspection {
  locate(fiber?: Fiber): string | undefined
}

interface StoreImpl {
  readonly name: string
  readonly fiber: Fiber
}

interface FiberEntry {
  readonly options?: { readonly name?: unknown }
}

function phaseOf(fiber: Fiber): ArchitectureFiberPhase {
  return FIBER_PHASE[fiber.state as number] ?? 'pending'
}

function effectView(
  meta: EffectMeta,
  depth: number,
  budget: { remaining: number },
): ArchitectureEffectView {
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

function liveServices(ctx: Context): StoreImpl[] {
  const store = ctx.root.reflect.store as unknown as Record<symbol, StoreImpl | undefined>
  const services: StoreImpl[] = []
  for (const key of Object.getOwnPropertySymbols(store)) {
    const impl = store[key]
    if (impl !== undefined && impl.fiber.uid !== null) services.push(impl)
  }
  return services
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

function dependencyView(fiber: Fiber, name: string): ArchitectureDependencyView {
  const resolved = fiber.store?.[name]
  if (resolved !== undefined && resolved.fiber.uid !== null) {
    return Object.freeze({
      name,
      status: 'resolved' as const,
      providerFiberUid: resolved.fiber.uid,
    })
  }
  const status: ArchitectureDependencyStatus = fiber.ctx.get(name) === undefined ? 'missing' : 'available'
  return Object.freeze({ name, status, providerFiberUid: null })
}

function moduleNameOf(fiber: Fiber): string | null {
  const entry = (fiber as Fiber & { entry?: FiberEntry }).entry
  const name = entry?.options?.name
  return typeof name === 'string' && name.length > 0 && name.length <= MAX_LABEL_LENGTH ? name : null
}

/** Inspect one Cordis context without caching or inventing cross-plane identity. */
export function projectRuntimeArchitecture(
  ctx: Context,
  plane: ArchitecturePlane,
): RuntimeArchitectureSnapshot {
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
  const fiberViews: ArchitectureFiberView[] = allFibers.map((fiber) => {
    const parent = fiber.parent.fiber
    const budget = { remaining: MAX_EFFECTS_PER_FIBER }
    return Object.freeze({
      uid: fiber.uid ?? 0,
      name: fiber.name,
      phase: phaseOf(fiber),
      parentUid: parent === fiber ? null : parent.uid,
      loaderEntryId: loader?.locate(fiber) ?? null,
      moduleName: moduleNameOf(fiber),
      dependencies: Object.freeze(
        Object.keys(fiber.inject).sort().map(name => dependencyView(fiber, name)),
      ),
      providedServices: Object.freeze([...(servicesByFiber.get(fiber) ?? [])].sort()),
      effects: Object.freeze(fiber.getEffects().map(meta => effectView(meta, 0, budget))),
    })
  })

  const serviceViews: ArchitectureServiceView[] = services
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
