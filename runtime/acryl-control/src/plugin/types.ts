/**
 * Host-neutral values for ACRYL's plugin lifecycle capability (spec 034).
 *
 * One lifecycle vocabulary for every surface: a TUI command, a Web settings
 * panel, and the Desktop plugin tab all render these values, and the controller
 * in `controller.ts` returns them. Nothing here knows about Electron, a client
 * UI, a Blend, or a particular profile layout - those are host projections.
 *
 * @module acryl-control/plugin/types
 */

/** Public Cordis Fiber phases, plus `null` for a disposed entry. */
export type PluginLifecycleFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

export type PluginLifecycleAction = 'enable' | 'disable' | 'reload'

/** Live state of a mounted entry, as reported to a caller that knows only a package name. */
export type PluginLifecycleMountedStatus = 'active' | 'disabled'

/** One Loader entry with its current lifecycle projection. */
export interface PluginLifecycleEntryView {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly hostPhase: PluginLifecycleFiberPhase
  /** Whether the host's policy admits this entry to user lifecycle control. */
  readonly mutable: boolean
  /** Why this entry is not mutable; `null` when it is. */
  readonly protectedReason: string | null
  /**
   * Mutable, currently-mounted entries that hard-`inject` a service this entry
   * provides, transitively. Disabling this entry disables them with it.
   */
  readonly dependents: readonly string[]
}

/** Point-in-time lifecycle projection. */
export interface PluginLifecycleSnapshot {
  readonly entries: readonly PluginLifecycleEntryView[]
}

/** Result of a settled lifecycle mutation. */
export interface PluginLifecycleReceipt {
  readonly accepted: true
  readonly action: PluginLifecycleAction
  /** Every entry the action changed, in application order. */
  readonly entryIds: readonly string[]
  readonly snapshot: PluginLifecycleSnapshot
}
