/** Renderer-safe contract for plugin lifecycle inspection and control. */
export declare const PLUGIN_LIFECYCLE_PATH = "/api/acryl-plugin-admin/lifecycle";
export declare const PLUGIN_LIFECYCLE_ENABLE_PATH = "/api/acryl-plugin-admin/lifecycle/enable";
export declare const PLUGIN_LIFECYCLE_DISABLE_PATH = "/api/acryl-plugin-admin/lifecycle/disable";
export declare const PLUGIN_LIFECYCLE_RELOAD_PATH = "/api/acryl-plugin-admin/lifecycle/reload";
/** Public Cordis Fiber phases. */
export type PluginLifecycleFiberPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null;
/** One Host Loader row with its current cross-plane lifecycle projection. */
export interface PluginLifecycleEntryView {
    readonly entryId: string;
    readonly moduleName: string;
    readonly enabled: boolean;
    readonly hostPhase: PluginLifecycleFiberPhase;
    readonly clientPackage: string | null;
    readonly clientInBootGraph: boolean;
    readonly mutable: boolean;
    readonly protectedReason: string | null;
    /**
     * Mutable entries that hard-`inject` a service this entry provides. Disabling
     * this entry disables them in the same transaction.
     */
    readonly dependents: readonly string[];
}
/** Identity of the Blend whose rows are composed into this generation. */
export interface PluginLifecycleBlendView {
    readonly id: string;
    readonly kind: 'Blueprint' | 'Blend';
    readonly version: string;
    /** sha256:<hex> over the origin definition bytes, as recorded in the lock. */
    readonly digest: string;
    /** Exact lock file path the launcher projected this generation from. */
    readonly lockPath: string;
    readonly rows: number;
}
/** Point-in-time Host lifecycle projection. */
export interface PluginLifecycleSnapshot {
    readonly entries: readonly PluginLifecycleEntryView[];
    /** The selected Blend, or null when no `dsh-desktop.blend` is configured. */
    readonly blend: PluginLifecycleBlendView | null;
}
/** Exact entry-targeted mutation request. */
export interface PluginLifecycleEntryRequest {
    readonly entryId: string;
}
/** Host mutation acceptance returned before the renderer refreshes itself. */
export interface PluginLifecycleReceipt {
    readonly accepted: true;
    readonly action: 'enable' | 'disable' | 'reload';
    readonly entryIds: readonly string[];
    readonly rendererReloadRequired: boolean;
    readonly snapshot: PluginLifecycleSnapshot;
}
/** Stable private-route failure shape. */
export interface PluginLifecycleErrorResponse {
    readonly error: string;
}
