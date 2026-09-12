/**
 * Desktop's own inputs to the shared plugin lifecycle.
 *
 * The override store itself lives in `acryl-harness-runtime` (`plugin-lifecycle-state.ts`),
 * because the Web surface and the CLI read and write the same
 * `plugin-lifecycle/state.json` (spec 034). What stays here is what only this
 * profile can answer: which rows it composes and therefore always admits to
 * user control, and the launcher-owned bootstrap value the Host reads them
 * from.
 */

import type { DesktopBlendProjection } from './desktop-blend.ts'
import type { PluginLifecycleStatePersistence } from 'acryl-harness-runtime'

/** Legacy seed of always-mutable entries that are not user-added profile bundles. */
export interface ManagedPluginLifecycleEntry {
  /** Runtime Loader identity, including its owning Include path. */
  readonly entryId: string
  /** Patch-local identity used while composing the next generation. */
  readonly patchId: string
  /** Exact module specifier required at runtime. */
  readonly moduleName: string
  /** Whether this package contributes a browser plugin. */
  readonly clientPackage: string | null
}

/**
 * Entries that are user-mutable regardless of the profile bundle list: the
 * Development Canvas and the two brand-slot packages. Every other mutable
 * entry is derived at runtime from `dsh.profile.bundles` (see the lifecycle
 * host in `acryl-harness-runtime`).
 */
export const MANAGED_PLUGIN_LIFECYCLE_ENTRIES = Object.freeze({
  'include:desktop-development-canvas': Object.freeze({
    entryId: 'include:desktop-development-canvas',
    patchId: 'desktop-development-canvas',
    moduleName: 'acryl-development-canvas',
    clientPackage: 'acryl-development-canvas',
  }),
  // Brand swap pair: both occupy the identical sidebar/hero brand slot
  // contract (see profile.ts's DESKTOP_BRAND composition). `kind: 'single'`
  // slots tolerate more than one registrant (first by priority/registration
  // order renders, the rest are silently ignored - no throw), so enabling
  // both at once is safe but ambiguous; disable the current brand before
  // enabling the other for a clean swap.
  'include:ui-brand-official': Object.freeze({
    entryId: 'include:ui-brand-official',
    patchId: 'ui-brand-official',
    moduleName: '@deepseek-ai/dsh-client-ui-brand-official',
    clientPackage: '@deepseek-ai/dsh-client-ui-brand-official',
  }),
  'include:ui-acryl': Object.freeze({
    entryId: 'include:ui-acryl',
    patchId: 'ui-acryl',
    moduleName: 'dsh-client-ui-brand-acryl',
    clientPackage: 'dsh-client-ui-brand-acryl',
  }),
} satisfies Readonly<Record<string, ManagedPluginLifecycleEntry>>)

export type ManagedPluginLifecycleEntryId = keyof typeof MANAGED_PLUGIN_LIFECYCLE_ENTRIES

/** Inputs needed by the live Host controller: persistence plus the profile dir. */
export interface PluginLifecycleStateBootstrap extends PluginLifecycleStatePersistence {
  /** Active profile directory - source of the user-mutable bundle list. */
  readonly profileDir: string
  /** BLEND projection for the selected Blend; its rows are user-mutable entries. */
  readonly blend?: DesktopBlendProjection
  /**
   * Path to the plugin-management state file (`disabledBundles`, a separate
   * store owned by `desktop-plugins.ts`). Optional; when present, a live
   * uninstall prunes the package's stale disable record there so it does not
   * block a later reinstall through the market.
   */
  readonly pluginManagementStatePath?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Launcher-owned persistence values for managed Loader entry lifecycle. */
    desktopPluginLifecycleBootstrap: PluginLifecycleStateBootstrap
  }
}
