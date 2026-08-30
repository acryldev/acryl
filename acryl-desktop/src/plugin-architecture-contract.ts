/** Renderer-safe, read-only projection of the native Cordis runtime graph. */

import type { PluginLifecycleFiberPhase } from './plugin-lifecycle-contract.ts'

export const PLUGIN_ARCHITECTURE_PATH = '/api/desktop/plugins/architecture'

export type CordisPlane = 'host' | 'client'
export type CordisDependencyStatus = 'resolved' | 'available' | 'missing'

/** One currently owned, labeled Cordis effect and its nested ownership. */
export interface CordisEffectView {
  readonly label: string
  readonly children: readonly CordisEffectView[]
}

/** One native `inject` declaration and its current resolution state. */
export interface CordisDependencyView {
  readonly name: string
  readonly status: CordisDependencyStatus
  readonly providerFiberUid: number | null
}

/** One live Cordis Fiber. Repeated mounts remain distinct by UID. */
export interface CordisFiberView {
  readonly uid: number
  readonly name: string
  readonly phase: Exclude<PluginLifecycleFiberPhase, null>
  readonly parentUid: number | null
  readonly loaderEntryId: string | null
  readonly moduleName: string | null
  readonly dependencies: readonly CordisDependencyView[]
  readonly providedServices: readonly string[]
  readonly effects: readonly CordisEffectView[]
}

/** One live service implementation and its owning Fiber. */
export interface CordisServiceView {
  readonly name: string
  readonly providerFiberUid: number
  readonly providerName: string
  readonly providerPhase: Exclude<PluginLifecycleFiberPhase, null>
}

/** Point-in-time native graph for one independent Cordis context. */
export interface CordisPlaneSnapshot {
  readonly plane: CordisPlane
  readonly fibers: readonly CordisFiberView[]
  readonly services: readonly CordisServiceView[]
}

/** Host and renderer contexts shown side by side without false identity merging. */
export interface PluginArchitectureSnapshot {
  readonly host: CordisPlaneSnapshot
  readonly client: CordisPlaneSnapshot
}
