/**
 * Desktop's projection of the shared plugin lifecycle (spec 034, T005).
 *
 * The lifecycle itself - resolution, dependent cascade, transaction ordering,
 * rollback, Fiber restart, persistence - is the one controller in
 * `acryl-harness-runtime`/`acryl-control` that the CLI and the Web surface run
 * too, and its renderer-facing projection (client graph, Blend, receipts) is the
 * shared `acryl-plugin-admin` view. What this file adds is Desktop's surface
 * concerns: which of its profile rows the user may toggle, and the plugin-market
 * bridge that mounts a just-installed bundle without a restart.
 */

import { type Context, Service } from '@deepseek-ai/cordis'
import {
  AcrPluginLifecycleService,
  createAcrylPluginLifecycle,
  type AcrPluginLifecycleController,
} from 'acryl-harness-runtime'
import {
  PluginLifecycleView,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from 'acryl-plugin-admin'
import { removeDesktopDisabledBundle } from '../desktop-plugins.ts'
import { assertDesktopProfileName } from '../../profile/profile-manager.ts'
import {
  MANAGED_PLUGIN_LIFECYCLE_ENTRIES,
  type PluginLifecycleStateBootstrap,
} from './plugin-lifecycle-state.ts'

export { PluginLifecycleError, type PluginLifecycleErrorCode } from 'acryl-harness-runtime'

const PROTECTED_REASON = 'This core capability is part of the Desktop runtime and is not user-toggleable. Plugins you add through a profile bundle or the plugin market can be enabled, disabled, and reloaded here.'

/**
 * Host-internal capability the plugin market calls after it writes
 * `dsh.profile.bundles`, so an install/uninstall takes effect without a
 * process restart. Optional: the market degrades to a restart prompt when the
 * running deployment does not provide it.
 */
export interface LivePluginActivation {
  activate(packageName: string): Promise<void>
  deactivate(packageName: string): Promise<void>
  /**
   * Toggle a mounted entry by package name (spec 032 issue-01: the market's
   * Installed tab, which only knows package names, not Loader entry ids).
   * Resolves `false` when the package has no live entry, so the caller falls
   * back to its own persisted state.
   */
  setEnabled(packageName: string, enabled: boolean): Promise<boolean>
  /** Live enabled/disabled state for a mounted entry, or `undefined` when not mounted. */
  statusOf(packageName: string): 'active' | 'disabled' | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    livePluginActivation: LivePluginActivation
  }
}

const LEGACY_MUTABLE_ENTRY_IDS: ReadonlySet<string> = new Set(Object.keys(MANAGED_PLUGIN_LIFECYCLE_ENTRIES))

/** Desktop's view and market bridge over the shared lifecycle service. */
export class PluginLifecycleController {
  private readonly lifecycle: AcrPluginLifecycleController
  /** The renderer-facing projection shared with every surface (`acryl-plugin-admin`). */
  private readonly view: PluginLifecycleView
  /** Row ids this profile admits to user control, in both runtime spellings. */
  private readonly mutableEntryIds: ReadonlySet<string>

  constructor(
    private readonly ctx: Context,
    private readonly bootstrap: PluginLifecycleStateBootstrap,
  ) {
    const mutable = new Set(LEGACY_MUTABLE_ENTRY_IDS)
    for (const row of bootstrap.blend?.rows ?? []) {
      mutable.add(row.id)
      mutable.add(`include:${row.id}`)
    }
    this.mutableEntryIds = mutable
    this.lifecycle = createAcrylPluginLifecycle(ctx, {
      profileName: bootstrap.profileName,
      profileDir: bootstrap.profileDir,
      statePath: bootstrap.statePath,
      binName: 'acryl-desktop',
      mutableEntryIds: () => this.mutableEntryIds,
      protectedReason: PROTECTED_REASON,
      // Reload-all deliberately does NOT sweep market plugins: churning many
      // unrelated client fibers at once destabilises the renderer. Reload a
      // market plugin from its own card (`reload(entryId)`).
      reloadAllEntryIds: () => LEGACY_MUTABLE_ENTRY_IDS,
      validateProfileName: assertDesktopProfileName,
      afterDeactivate: packageName => this.pruneStaleDisable(packageName),
      warn: message => { this.ctx.logger?.warn?.(`acryl-desktop: ${message}`) },
    })
    this.view = new PluginLifecycleView(ctx, this.lifecycle, () => bootstrap.blend)
  }

  /**
   * Publish this surface's lifecycle authority as the context's shared
   * `ctx.acrPluginLifecycle` service, so every other entry point (a route, a
   * market bridge, the CLI) drives the same controller this surface renders.
   * Scoped to the caller's fiber.
   */
  publishLifecycleService(): AcrPluginLifecycleService {
    return new AcrPluginLifecycleService(this.ctx, this.lifecycle)
  }

  /** Every non-group Host entry and current Client graph membership. */
  snapshot(): PluginLifecycleSnapshot {
    return this.view.snapshot()
  }

  /** Persist and apply one managed entry's enablement, dependents included. */
  async setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.view.setEnabled(entryId, enabled)
  }

  /** Restart one entry, or every enabled entry of this profile's own seed. */
  async reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.view.reload(entryId)
  }

  /** Mount a just-installed profile bundle without a restart. Idempotent. */
  async activate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.view.receipt(await this.lifecycle.activate(packageName))
  }

  /** Unmount an uninstalled package, then let the market prune its record. */
  async deactivate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.view.receipt(await this.lifecycle.deactivate(packageName))
  }

  /** Restart the fiber of a mounted plugin. Used by the development watcher. */
  async reloadByPackage(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.view.receipt(await this.lifecycle.reloadByPackage(packageName))
  }

  /** Toggle a mounted entry by package name for a caller outside the Lifecycle tab. */
  setEnabledByPackageName(packageName: string, enabled: boolean): Promise<boolean> {
    return this.lifecycle.setEnabledByPackageName(packageName, enabled)
  }

  /** Live enabled/disabled state by package name, or `undefined` when not mounted. */
  statusOfPackage(packageName: string): 'active' | 'disabled' | undefined {
    return this.lifecycle.statusOfPackage(packageName)
  }

  /** Best-effort: never let a plugin-management cleanup failure fail the uninstall itself. */
  private async pruneStaleDisable(packageName: string): Promise<void> {
    if (this.bootstrap.pluginManagementStatePath === undefined) return
    await removeDesktopDisabledBundle(
      this.bootstrap.pluginManagementStatePath,
      this.bootstrap.profileName,
      packageName,
    )
  }
}

/**
 * Publishes {@link LivePluginActivation} on the Host context for the plugin
 * market to call after it writes `dsh.profile.bundles`. Thin wrapper over the
 * controller so the capability's lifetime is the desktop Host plugin's.
 */
export class LivePluginActivationService extends Service implements LivePluginActivation {
  constructor(ctx: Context, private readonly controller: PluginLifecycleController) {
    super(ctx, 'livePluginActivation')
  }

  async activate(packageName: string): Promise<void> {
    await this.controller.activate(packageName)
  }

  async deactivate(packageName: string): Promise<void> {
    await this.controller.deactivate(packageName)
  }

  setEnabled(packageName: string, enabled: boolean): Promise<boolean> {
    return this.controller.setEnabledByPackageName(packageName, enabled)
  }

  statusOf(packageName: string): 'active' | 'disabled' | undefined {
    return this.controller.statusOfPackage(packageName)
  }
}
