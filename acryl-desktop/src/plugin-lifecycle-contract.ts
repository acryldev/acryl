/** Renderer-safe contract for Desktop plugin lifecycle inspection and control. */

export const PLUGIN_LIFECYCLE_PATH = '/api/desktop/plugins/lifecycle'
export const PLUGIN_LIFECYCLE_ENABLE_PATH = '/api/desktop/plugins/lifecycle/enable'
export const PLUGIN_LIFECYCLE_DISABLE_PATH = '/api/desktop/plugins/lifecycle/disable'
export const PLUGIN_LIFECYCLE_RELOAD_PATH = '/api/desktop/plugins/lifecycle/reload'

/** Public Cordis Fiber phases. */
export type PluginLifecycleFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One Host Loader row with its current cross-plane lifecycle projection. */
export interface PluginLifecycleEntryView {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly hostPhase: PluginLifecycleFiberPhase
  readonly clientPackage: string | null
  readonly clientInBootGraph: boolean
  readonly mutable: boolean
  readonly protectedReason: string | null
}

/** Point-in-time Host lifecycle projection. */
export interface PluginLifecycleSnapshot {
  readonly entries: readonly PluginLifecycleEntryView[]
}

/** Exact entry-targeted mutation request. */
export interface PluginLifecycleEntryRequest {
  readonly entryId: string
}

/** Host mutation acceptance returned before the renderer refreshes itself. */
export interface PluginLifecycleReceipt {
  readonly accepted: true
  readonly action: 'enable' | 'disable' | 'reload'
  readonly entryIds: readonly string[]
  readonly rendererReloadRequired: boolean
  readonly snapshot: PluginLifecycleSnapshot
}

/** Stable private-route failure shape. */
export interface PluginLifecycleErrorResponse {
  readonly error: string
}
