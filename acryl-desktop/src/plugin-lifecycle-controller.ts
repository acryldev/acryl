/** Host lifecycle authority for explicitly managed Desktop Loader entries. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { type Context, type Fiber, type FiberState, Service } from '@deepseek-ai/cordis'
import type { Entry, EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-client-modules'
import { removeDesktopDisabledBundle } from './desktop-plugins.ts'
import type {
  PluginLifecycleEntryView,
  PluginLifecycleFiberPhase,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './plugin-lifecycle-contract.ts'
import {
  MANAGED_PLUGIN_LIFECYCLE_ENTRIES,
  readUserMutableBundleNames,
  setPluginLifecycleEntryEnabled,
  type PluginLifecycleStateBootstrap,
} from './plugin-lifecycle-state.ts'

const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginLifecycleFiberPhase>

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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    livePluginActivation: LivePluginActivation
  }
}

const LEGACY_MUTABLE_ENTRY_IDS: ReadonlySet<string> = new Set(Object.keys(MANAGED_PLUGIN_LIFECYCLE_ENTRIES))

/** Stable failures that private routes and human commands may present. */
export type PluginLifecycleErrorCode =
  | 'unknown-entry'
  | 'protected-entry'
  | 'already-enabled'
  | 'already-disabled'
  | 'not-mounted'
  | 'persistence-failed'
  | 'lifecycle-failed'

export class PluginLifecycleError extends Error {
  constructor(readonly code: PluginLifecycleErrorCode, message: string) {
    super(message)
    this.name = 'PluginLifecycleError'
  }
}

interface PackageManifest {
  readonly name?: unknown
  readonly exports?: unknown
  readonly dsh?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function declaresClientFace(manifest: PackageManifest, moduleName: string): boolean {
  if (manifest.name !== moduleName || !isRecord(manifest.dsh)) return false
  const client = manifest.dsh.client
  if (!isRecord(client) || client.platform !== 'web') return false
  if (!isRecord(manifest.exports)) return false
  return Object.prototype.hasOwnProperty.call(manifest.exports, './client')
}

function phaseOf(entry: Entry): PluginLifecycleFiberPhase {
  return entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state]
}

/** Deep module hiding persistence, Loader mutation, rollback, and cross-plane projection. */
export class PluginLifecycleController {
  private operation = Promise.resolve()
  private readonly clientFaces = new Map<string, boolean>()
  /** Row ids from the selected BLEND's lock, in both runtime id spellings. */
  private readonly blendRowIds: ReadonlySet<string>
  private readonly resolvePackageJson: ((specifier: string) => string) | undefined
  /**
   * Package names from `dsh.profile.bundles` (minus the base template).
   * Re-read on `activate`/`deactivate` because the Market install writes the
   * bundle list milliseconds before it asks for a live mount.
   */
  private userBundleNames: ReadonlySet<string>

  constructor(
    private readonly ctx: Context,
    private readonly bootstrap: PluginLifecycleStateBootstrap,
  ) {
    if (ctx.baseUrl !== undefined) {
      const require = createRequire(ctx.baseUrl)
      this.resolvePackageJson = specifier => require.resolve(`${specifier}/package.json`)
    }
    this.userBundleNames = readUserMutableBundleNames(bootstrap.profileDir)
    const blendRowIds = new Set<string>()
    if (bootstrap.blend !== undefined) {
      for (const row of bootstrap.blend.rows) {
        blendRowIds.add(row.id)
        blendRowIds.add(`include:${row.id}`)
      }
    }
    this.blendRowIds = blendRowIds
  }

  private refreshUserBundles(): void {
    this.userBundleNames = readUserMutableBundleNames(this.bootstrap.profileDir)
  }

  /**
   * A Loader entry is user-mutable when it is the Development Canvas or a
   * brand-slot package (the legacy seed), when its package was added to the
   * active profile's `dsh.profile.bundles` (a profile bundle or a market
   * install), or when its row id comes from the selected BLEND's lock (D25).
   * Core runtime capabilities and the base-template includes are not.
   */
  private isMutable(entry: Entry): boolean {
    if (entry.options.group) return false
    if (LEGACY_MUTABLE_ENTRY_IDS.has(entry.id)) return true
    if (this.blendRowIds.has(entry.id) || this.blendRowIds.has(`include:${entry.id}`)) return true
    return typeof entry.options.name === 'string' && this.userBundleNames.has(entry.options.name)
  }

  /** Service names whose live provider is `fiber`. */
  private servicesProvidedBy(fiber: Fiber): ReadonlySet<string> {
    const store = (this.ctx.root as { reflect?: { store?: Record<symbol, { name: string; fiber: Fiber } | undefined> } })
      .reflect?.store
    const names = new Set<string>()
    if (store === undefined) return names
    for (const key of Object.getOwnPropertySymbols(store)) {
      const impl = store[key]
      if (impl !== undefined && impl.fiber === fiber) names.add(impl.name)
    }
    return names
  }

  /**
   * Mutable, currently-mounted entries that hard-`inject` a service `entry`
   * provides and resolve it to `entry`'s fiber - transitively.
   */
  private mutableDependents(entry: Entry): Entry[] {
    const byId = new Map([...this.ctx.loader.entries()].map(candidate => [candidate.id, candidate]))
    const found = new Map<string, Entry>()
    const queue: Entry[] = [entry]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.fiber === undefined) continue
      const provided = this.servicesProvidedBy(current.fiber)
      if (provided.size === 0) continue
      for (const other of byId.values()) {
        if (other === entry || found.has(other.id) || other.options.group) continue
        if (other.fiber === undefined || !this.isMutable(other)) continue
        const inject = (other.fiber as { inject?: Record<string, unknown> }).inject ?? {}
        const store = (other.fiber as { store?: Record<string, { fiber?: Fiber } | undefined> }).store ?? {}
        const dependsOnCurrent = Object.keys(inject)
          .some(name => provided.has(name) && store[name]?.fiber === current.fiber)
        if (dependsOnCurrent) {
          found.set(other.id, other)
          queue.push(other)
        }
      }
    }
    return [...found.values()]
  }

  /** Read every non-group Host entry and current Client graph membership. */
  snapshot(): PluginLifecycleSnapshot {
    const graph = this.ctx.get('clientModules')?.graph()
    const clientGraph = new Set(graph?.entries.map(entry => entry.id) ?? [])
    const entries: PluginLifecycleEntryView[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const clientPackage = this.clientPackage(entry.options.name, clientGraph)
      const mutable = this.isMutable(entry)
      entries.push(Object.freeze({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        hostPhase: phaseOf(entry),
        clientPackage,
        clientInBootGraph: clientPackage !== null && clientGraph.has(clientPackage),
        mutable,
        protectedReason: mutable ? null : PROTECTED_REASON,
        dependents: mutable && !entry.disabled
          ? Object.freeze(this.mutableDependents(entry).map(dependent => dependent.id))
          : Object.freeze([]),
      }))
    }
    const blend = this.bootstrap.blend
    return Object.freeze({
      entries: Object.freeze(entries),
      blend: blend === undefined ? null : Object.freeze({
        id: blend.origin.id,
        kind: blend.origin.kind,
        version: blend.origin.version,
        digest: blend.origin.digest,
        lockPath: blend.lockPath,
        rows: blend.rows.length,
      }),
    })
  }

  /**
   * Persist and apply one managed entry enablement transactionally. Disabling
   * an entry that mutable plugins depend on disables those dependents in the
   * same transaction (dependents first, so a consumer unmounts before its
   * provider); the receipt lists every id changed.
   */
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const { entry } = this.resolveMutable(entryId)
      if ((!entry.disabled) === enabled) {
        throw new PluginLifecycleError(
          enabled ? 'already-enabled' : 'already-disabled',
          `Plugin ${entryId} is already ${enabled ? 'enabled' : 'disabled'}.`,
        )
      }
      // Disable: [dependents (transitive), then the target]. Enable: just the target.
      const targets = enabled
        ? [entry]
        : [...this.mutableDependents(entry).filter(dependent => !dependent.disabled), entry]

      const applied: Entry[] = []
      try {
        for (const target of targets) {
          await setPluginLifecycleEntryEnabled(this.bootstrap, target.id, enabled)
          await target.update({ disabled: !enabled })
          applied.push(target)
        }
        await Promise.resolve()
      } catch (cause) {
        const rollbackErrors: string[] = []
        for (const target of applied.reverse()) {
          try {
            await setPluginLifecycleEntryEnabled(this.bootstrap, target.id, !enabled)
            await target.update({ disabled: enabled })
          } catch (rollbackCause) {
            rollbackErrors.push(rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause))
          }
        }
        const detail = cause instanceof Error ? cause.message : String(cause)
        throw new PluginLifecycleError(
          rollbackErrors.length > 0 ? 'persistence-failed' : 'lifecycle-failed',
          rollbackErrors.length > 0
            ? `Plugin lifecycle change failed and rollback also failed: ${detail}; ${rollbackErrors.join('; ')}`
            : `Plugin lifecycle change failed: ${detail}`,
        )
      }
      return this.receipt(enabled ? 'enable' : 'disable', applied.map(target => target.id), true)
    })
  }

  /**
   * Restart one entry, or - with no argument - every currently enabled entry
   * in the legacy seed (Development Canvas + the active brand). Reload-all
   * deliberately does NOT sweep market plugins: churning many unrelated client
   * fibers at once destabilises the renderer. Reload a market plugin from its
   * own card (`reload(entryId)`).
   */
  reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entries = entryId === undefined
        ? [...this.ctx.loader.entries()].filter(entry =>
            LEGACY_MUTABLE_ENTRY_IDS.has(entry.id) && !entry.options.group && !entry.disabled)
        : [this.resolveMutable(entryId).entry]
      if (entries.length === 0) {
        throw new PluginLifecycleError('not-mounted', 'No managed plugin is currently mounted.')
      }
      for (const entry of entries) {
        if (entry.disabled || entry.fiber === undefined) {
          throw new PluginLifecycleError('not-mounted', `Plugin ${entry.id} is not mounted.`)
        }
        try {
          await entry.fiber.restart()
        } catch (cause) {
          throw new PluginLifecycleError(
            'lifecycle-failed',
            `Plugin ${entry.id} failed to reload: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
      await Promise.resolve()
      return this.receipt('reload', entries.map(entry => entry.id), true)
    })
  }

  /**
   * Mount a just-installed profile-bundle package into the running Loader tree,
   * so a Market install takes effect without a restart. The bundle's row comes
   * from its own `cordis.patch.yml` `insert` (id and package name may differ).
   * Idempotent: a package already mounted returns its current snapshot.
   */
  activate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      this.refreshUserBundles()
      if (!this.userBundleNames.has(packageName)) {
        throw new PluginLifecycleError(
          'protected-entry',
          `Package ${packageName} is not a profile bundle in the active profile.`,
        )
      }
      const already = [...this.ctx.loader.entries()]
        .find(entry => !entry.options.group && entry.options.name === packageName)
      if (already !== undefined) return this.receipt('enable', [already.id], true)

      const group = this.includeGroup()
      const row = this.bundleInsertRow(packageName)
      // The Loader's create() keeps a provided id (ensureId only generates one
      // when absent); its type omits `id` to steer callers toward generated
      // ids, but a bundle row's id must stay stable so the reboot patch (by id)
      // and the Lifecycle toggle target the same entry.
      const rowOptions: EntryOptions = { id: row.id, name: row.name }
      try {
        await group.create(rowOptions)
        group.data.push(rowOptions)
        await this.ctx.loader.await?.()
      } catch (cause) {
        try { await group.remove(row.id) } catch { /* best effort */ }
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to activate: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      const entry = [...this.ctx.loader.entries()].find(candidate => candidate.options.id === row.id)
      return this.receipt('enable', [entry?.id ?? `include:${row.id}`], true)
    })
  }

  /**
   * Unmount a Market-uninstalled package from the running Loader tree. No-op
   * when it is already gone. Always prunes any stale `plugin-management`
   * disable record for the package (spec 032 issue 01): a package that has
   * left `dsh.profile.bundles` has nothing left to be disabled, and a leftover
   * record there makes the market treat it as "installed but disabled" and
   * hide the managed install path on reinstall.
   */
  deactivate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entry = [...this.ctx.loader.entries()]
        .find(candidate => !candidate.options.group && candidate.options.name === packageName)
      if (entry === undefined) {
        await this.pruneStaleDisable(packageName)
        return this.receipt('disable', [], true)
      }
      const rowId = entry.options.id
      try {
        await entry.parent.remove(rowId)
        await this.ctx.loader.await?.()
      } catch (cause) {
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to deactivate: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      this.refreshUserBundles()
      await this.pruneStaleDisable(packageName)
      return this.receipt('disable', [entry.id], true)
    })
  }

  /** Best-effort: never let a plugin-management cleanup failure fail the uninstall itself. */
  private async pruneStaleDisable(packageName: string): Promise<void> {
    if (this.bootstrap.pluginManagementStatePath === undefined) return
    try {
      await removeDesktopDisabledBundle(
        this.bootstrap.pluginManagementStatePath,
        this.bootstrap.profileName,
        packageName,
      )
    } catch (cause) {
      this.ctx.logger?.warn?.(
        `acryl-desktop: could not clear the stale plugin-management disable record for ${packageName}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }

  /**
   * Restart the fiber of a mounted plugin identified by package name. Used by
   * the local-development file watcher. No-op when the package is not mounted.
   */
  reloadByPackage(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entry = [...this.ctx.loader.entries()]
        .find(candidate => !candidate.options.group && candidate.options.name === packageName)
      if (entry === undefined || entry.disabled || entry.fiber === undefined) {
        return this.receipt('reload', [], true)
      }
      try {
        await entry.fiber.restart()
      } catch (cause) {
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to reload: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      await Promise.resolve()
      return this.receipt('reload', [entry.id], true)
    })
  }

  /** The Loader group that owns profile-bundle rows (`include:<id>`). */
  private includeGroup(): Entry['parent'] {
    const sibling = [...this.ctx.loader.entries()]
      .find(entry => !entry.options.group && entry.id.startsWith('include:'))
    if (sibling === undefined) {
      throw new PluginLifecycleError('lifecycle-failed', 'The profile include group is not available.')
    }
    return sibling.parent
  }

  /** Read `{ id, name }` from a profile bundle's own `cordis.patch.yml` insert. */
  private bundleInsertRow(packageName: string): { readonly id: string; readonly name: string } {
    if (this.resolvePackageJson === undefined) {
      throw new PluginLifecycleError('lifecycle-failed', 'Package resolution is unavailable in this context.')
    }
    const packageDir = dirname(this.resolvePackageJson(packageName))
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
      readonly dsh?: { readonly bundle?: { readonly patch?: unknown } }
    }
    const patchRel = manifest.dsh?.bundle?.patch
    if (typeof patchRel !== 'string') {
      throw new PluginLifecycleError('lifecycle-failed', `Package ${packageName} declares no dsh.bundle.patch.`)
    }
    const patches = loadOverlayPatches('acryl-desktop', join(packageDir, patchRel)) as ReadonlyArray<{
      readonly insert?: ReadonlyArray<{ readonly id?: unknown; readonly name?: unknown }>
    }>
    const row = patches.find(patch => Array.isArray(patch.insert))?.insert?.[0]
    if (typeof row?.id !== 'string' || typeof row.name !== 'string') {
      throw new PluginLifecycleError('lifecycle-failed', `Package ${packageName} bundle patch has no insert row.`)
    }
    return { id: row.id, name: row.name }
  }

  private clientPackage(moduleName: string, graph: ReadonlySet<string>): string | null {
    if (graph.has(moduleName)) return moduleName
    const cached = this.clientFaces.get(moduleName)
    if (cached !== undefined) return cached ? moduleName : null
    let declared = false
    if (!moduleName.startsWith('cordis:') && this.resolvePackageJson !== undefined) {
      try {
        const manifest = JSON.parse(readFileSync(this.resolvePackageJson(moduleName), 'utf8')) as PackageManifest
        declared = declaresClientFace(manifest, moduleName)
      } catch {
        declared = false
      }
    }
    this.clientFaces.set(moduleName, declared)
    return declared ? moduleName : null
  }

  private resolveMutable(entryId: string): { readonly entry: Entry } {
    const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === entryId)
    if (entry === undefined) {
      throw new PluginLifecycleError('unknown-entry', `Unknown plugin ${entryId}.`)
    }
    if (!this.isMutable(entry)) {
      throw new PluginLifecycleError('protected-entry', `Plugin ${entryId} is a core capability and cannot be toggled.`)
    }
    return { entry }
  }

  private receipt(
    action: PluginLifecycleReceipt['action'],
    entryIds: readonly string[],
    rendererReloadRequired: boolean,
  ): PluginLifecycleReceipt {
    return Object.freeze({
      accepted: true,
      action,
      entryIds: Object.freeze([...entryIds]),
      rendererReloadRequired,
      snapshot: this.snapshot(),
    })
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation)
    this.operation = next.then(() => undefined, () => undefined)
    return next
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
}
