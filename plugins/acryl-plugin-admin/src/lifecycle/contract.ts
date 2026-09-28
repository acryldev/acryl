/** Renderer-safe contract for plugin lifecycle inspection and control. */

export const PLUGIN_LIFECYCLE_PATH = '/api/acryl-plugin-admin/lifecycle'
export const PLUGIN_LIFECYCLE_ENABLE_PATH = '/api/acryl-plugin-admin/lifecycle/enable'
export const PLUGIN_LIFECYCLE_DISABLE_PATH = '/api/acryl-plugin-admin/lifecycle/disable'
export const PLUGIN_LIFECYCLE_RELOAD_PATH = '/api/acryl-plugin-admin/lifecycle/reload'

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
  /**
   * Mutable entries that hard-`inject` a service this entry provides. Disabling
   * this entry disables them in the same transaction.
   */
  readonly dependents: readonly string[]
}

/**
 * Identity of what is composed into this generation. Two real identities exist (spec 040 T083), not one:
 * Desktop's launcher can pin a `dsh-desktop.blend` setting to an exact locked generation (a digest and a lock
 * file it was projected from, so it can be verified byte-for-byte); every surface (Web, CLI and Desktop alike)
 * can also boot from an `ACRYL_BLUEPRINT` selection, which names a Blueprint by id with no lock and no digest -
 * a real, current identity, just not a locked one. Showing a locked one's fields as empty or fabricated for the
 * unlocked case would be dishonest, so this is `locked` first and the rest of the shape follows from it.
 */
export type PluginLifecycleBlendView =
  | {
    readonly locked: true
    readonly id: string
    readonly kind: 'Blueprint' | 'Blend'
    readonly version: string
    /** sha256:<hex> over the origin definition bytes, as recorded in the lock. */
    readonly digest: string
    /** Exact lock file path the launcher projected this generation from. */
    readonly lockPath: string
    readonly rows: number
  }
  | {
    readonly locked: false
    /** The Blueprint id `ACRYL_BLUEPRINT` selected (or its default), e.g. `acryl.ide`. */
    readonly id: string
    readonly name: string
    readonly rows: number
  }

/** Point-in-time Host lifecycle projection. */
export interface PluginLifecycleSnapshot {
  readonly entries: readonly PluginLifecycleEntryView[]
  /** The selected Blend, or null when no `dsh-desktop.blend` is configured. */
  readonly blend: PluginLifecycleBlendView | null
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
