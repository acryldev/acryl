/**
 * Host-neutral lifecycle authority over explicitly managed Loader entries.
 *
 * Every surface runs this one controller: the TUI drives it for `plugin
 * enable|disable`, the Web surface mounts it through the runtime, and Desktop
 * wraps it with its own projection and market bridge. The controller decides
 * resolution, cascade, order, and rollback; the host port
 * (`host.ts`) decides policy and persistence.
 *
 * @module acryl-control/plugin/controller
 */

import { type Context, type Fiber, type FiberState } from '@deepseek-ai/cordis'
import type { Entry, EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import {
  PROTECTED_PLUGIN_ENTRY_REASON,
  type PluginLifecycleEntryRef,
  type PluginLifecycleHost,
} from './host.ts'
import type {
  PluginLifecycleAction,
  PluginLifecycleEntryView,
  PluginLifecycleFiberPhase,
  PluginLifecycleMountedStatus,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './types.ts'

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

/** Stable failures that a route, a command, or a panel may present. */
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

function phaseOf(entry: Entry): PluginLifecycleFiberPhase {
  return entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state as FiberState]
}

/**
 * The bare Fiber behind the thenable wrapper the registry hands out.
 *
 * `ctx.plugin()` returns `Object.create(fiber)` with an own `then`, and the
 * Loader keeps that wrapper as `entry.fiber`, while plugin code sees the bare
 * fiber as `ctx.fiber` and service implementations record that one. Any
 * comparison between an entry's fiber and a service's providing fiber has to
 * unwrap the entry side first, or it never matches.
 */
function bareFiber(fiber: Fiber): Fiber {
  return Object.hasOwn(fiber, 'then') ? (Object.getPrototypeOf(fiber) as Fiber) : fiber
}

function refOf(entry: Entry): PluginLifecycleEntryRef {
  return { entryId: entry.id, moduleName: entry.options.name, group: entry.options.group === true }
}

/** Deep module hiding Loader mutation, ordering, rollback, and cascade policy. */
export class AcrPluginLifecycleController {
  private operation = Promise.resolve()
  /**
   * Entry ids this controller mounted, keyed by the package that asked for
   * them. A bundle's insert row names a module specifier that need not equal
   * the package name (`acryl-desktop` inserts `acryl-desktop/terminal`), and
   * after an uninstall the package can no longer be asked - so what an
   * activation actually created is the only authority that outlives it.
   */
  private readonly activatedEntries = new Map<string, string>()

  constructor(
    private readonly ctx: Context,
    private readonly host: PluginLifecycleHost,
  ) {}

  /** Project every non-group Loader entry and the host's mutation policy. */
  snapshot(): PluginLifecycleSnapshot {
    const entries: PluginLifecycleEntryView[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const mutable = this.isMutable(entry)
      entries.push(Object.freeze({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        hostPhase: phaseOf(entry),
        mutable,
        protectedReason: mutable ? null : this.protectedReason(entry),
        dependents: mutable && !entry.disabled
          ? Object.freeze(this.mutableDependents(entry).map(dependent => dependent.id))
          : Object.freeze([]),
      }))
    }
    return Object.freeze({ entries: Object.freeze(entries) })
  }

  /**
   * Persist and apply one managed entry's enablement transactionally. Disabling
   * an entry that mutable plugins depend on disables those dependents in the
   * same transaction (dependents first, so a consumer unmounts before its
   * provider); the receipt lists every id changed.
   */
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entry = this.resolveMutable(entryId)
      if ((!entry.disabled) === enabled) {
        throw new PluginLifecycleError(
          enabled ? 'already-enabled' : 'already-disabled',
          `Plugin ${entryId} is already ${enabled ? 'enabled' : 'disabled'}.`,
        )
      }
      const targets = enabled
        ? [entry]
        : [...this.mutableDependents(entry).filter(dependent => !dependent.disabled), entry]

      // A target joins `persisted` as soon as its override is written, before
      // the Loader applies it: an update that throws still left the persisted
      // state changed, and skipping that one in the rollback would hand the
      // next boot a disable the user was told had failed.
      const persisted: Entry[] = []
      try {
        for (const target of targets) {
          await this.host.setEnabled(target.id, enabled)
          persisted.push(target)
          await target.update({ disabled: !enabled })
        }
      } catch (cause) {
        const rollbackErrors: string[] = []
        for (const target of persisted.reverse()) {
          try {
            await this.host.setEnabled(target.id, !enabled)
            await target.update({ disabled: enabled })
          } catch (rollbackCause) {
            rollbackErrors.push(describe(rollbackCause))
          }
        }
        const detail = describe(cause)
        throw new PluginLifecycleError(
          rollbackErrors.length > 0 ? 'persistence-failed' : 'lifecycle-failed',
          rollbackErrors.length > 0
            ? `Plugin lifecycle change failed and rollback also failed: ${detail}; ${rollbackErrors.join('; ')}`
            : `Plugin lifecycle change failed: ${detail}`,
        )
      }
      return this.receipt(enabled ? 'enable' : 'disable', persisted.map(target => target.id))
    })
  }

  /**
   * Restart one entry, or - with no argument - the host's reload-all set:
   * {@link PluginLifecycleHost.reloadAllEntryIds} when the host narrows it
   * (Desktop deliberately avoids churning every market plugin's client fiber at
   * once), otherwise every enabled mutable entry.
   */
  reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entries = entryId === undefined ? this.reloadAllEntries() : [this.resolveMutable(entryId)]
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
            `Plugin ${entry.id} failed to reload: ${describe(cause)}`,
          )
        }
      }
      return this.receipt('reload', entries.map(entry => entry.id))
    })
  }

  /**
   * Mount a just-installed profile-bundle package into the running Loader tree,
   * so an install takes effect without a process restart. The bundle's row comes
   * from its own cordis patch, via {@link PluginLifecycleHost.bundleRow}.
   * Idempotent: a package already mounted returns its current snapshot.
   *
   * The host is asked for the row before the mounted-entry shortcut, so it
   * stays the single authority on what may be activated at all: only it can
   * tell an installed profile bundle from a package the market never managed.
   */
  activate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const row = this.host.bundleRow?.(packageName)
      if (row === undefined) {
        throw new PluginLifecycleError(
          'protected-entry',
          `Package ${packageName} cannot be activated by this host.`,
        )
      }
      const already = this.findLiveEntry(packageName)
      if (already !== undefined) {
        this.activatedEntries.set(packageName, already.id)
        return this.receipt('enable', [already.id])
      }

      const group = this.host.bundleGroup?.() ?? this.ctx.loader.root
      // The Loader's create() keeps a provided id (ensureId only generates one
      // when absent); its type omits `id` to steer callers toward generated
      // ids, but a bundle row's id must stay stable so the reboot patch (by id)
      // and a lifecycle toggle target the same entry.
      const rowOptions: EntryOptions & { id: string } = { id: row.id, name: row.name }
      try {
        await group.create(rowOptions)
        group.data.push(rowOptions)
        await this.ctx.loader.await?.()
      } catch (cause) {
        try { await group.remove(row.id) } catch { /* best effort */ }
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to activate: ${describe(cause)}`,
        )
      }
      const entry = [...this.ctx.loader.entries()].find(candidate => candidate.options.id === row.id)
      if (entry !== undefined) this.activatedEntries.set(packageName, entry.id)
      return this.receipt('enable', [entry?.id ?? `include:${row.id}`])
    })
  }

  /**
   * Unmount an uninstalled package from the running Loader tree, then let the
   * host prune any bookkeeping the package left behind. No-op when it is
   * already gone; the host's cleanup still runs, because a package that has left
   * the profile has nothing left to be disabled.
   */
  deactivate(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entry = this.findLiveEntry(packageName)
      if (entry === undefined) {
        await this.afterDeactivate(packageName)
        return this.receipt('disable', [])
      }
      const rowId = entry.options.id
      try {
        await entry.parent.remove(rowId)
        await this.ctx.loader.await?.()
      } catch (cause) {
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to deactivate: ${describe(cause)}`,
        )
      }
      await this.afterDeactivate(packageName)
      return this.receipt('disable', [entry.id])
    })
  }

  /**
   * Restart the fiber of a mounted plugin identified by package name. Used by a
   * local-development file watcher. No-op when the package is not mounted.
   */
  reloadByPackage(packageName: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entry = this.findLiveEntry(packageName)
      if (entry === undefined || entry.disabled || entry.fiber === undefined) {
        return this.receipt('reload', [])
      }
      try {
        await entry.fiber.restart()
      } catch (cause) {
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin ${packageName} failed to reload: ${describe(cause)}`,
        )
      }
      return this.receipt('reload', [entry.id])
    })
  }

  /**
   * Toggle a live entry by package name for a caller that knows only package
   * names, not Loader ids. Resolves `false` when no live entry exists (an import
   * failure, or not mounted yet), so the caller falls back to its own persisted
   * state - the only mechanism that still works when a bundle's module cannot
   * even be imported. Idempotent against a state that already matches, since the
   * caller's own view of "current status" may be the exact stale read this
   * method exists to correct.
   */
  async setEnabledByPackageName(packageName: string, enabled: boolean): Promise<boolean> {
    const entry = this.findLiveEntry(packageName)
    if (entry === undefined) return false
    try {
      await this.setEnabled(entry.id, enabled)
    } catch (cause) {
      if (cause instanceof PluginLifecycleError
        && (cause.code === 'already-enabled' || cause.code === 'already-disabled')) return true
      throw cause
    }
    return true
  }

  /**
   * Read a live entry's current enabled/disabled state by package name, or
   * `undefined` when it is not mounted (the caller's own persisted status is
   * authoritative in that case).
   */
  statusOfPackage(packageName: string): PluginLifecycleMountedStatus | undefined {
    const entry = this.findLiveEntry(packageName)
    if (entry === undefined) return undefined
    return entry.disabled ? 'disabled' : 'active'
  }

  private isMutable(entry: Entry): boolean {
    if (entry.options.group) return false
    return this.host.isMutable(refOf(entry))
  }

  private protectedReason(entry: Entry): string {
    return this.host.protectedReason?.(refOf(entry)) ?? PROTECTED_PLUGIN_ENTRY_REASON
  }

  private reloadAllEntries(): Entry[] {
    const narrowed = this.host.reloadAllEntryIds?.()
    return [...this.ctx.loader.entries()].filter((entry) => {
      if (entry.options.group || entry.disabled) return false
      return narrowed === undefined ? this.isMutable(entry) : narrowed.has(entry.id)
    })
  }

  /** Service names whose live provider is `fiber`. */
  private servicesProvidedBy(fiber: Fiber): ReadonlySet<string> {
    const store = (this.ctx.root as {
      reflect?: { store?: Record<symbol, { name: string, fiber: Fiber } | undefined> }
    }).reflect?.store
    const names = new Set<string>()
    if (store === undefined) return names
    const target = bareFiber(fiber)
    for (const key of Object.getOwnPropertySymbols(store)) {
      const impl = store[key]
      if (impl !== undefined && bareFiber(impl.fiber) === target) names.add(impl.name)
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
      const currentFiber = current.fiber
      if (currentFiber === undefined) continue
      const provided = this.servicesProvidedBy(currentFiber)
      if (provided.size === 0) continue
      for (const other of byId.values()) {
        if (other === entry || found.has(other.id) || other.options.group) continue
        if (other.fiber === undefined || !this.isMutable(other)) continue
        const inject = (other.fiber as { inject?: Record<string, unknown> }).inject ?? {}
        const store = (other.fiber as { store?: Record<string, { fiber?: Fiber } | undefined> }).store ?? {}
        const target = bareFiber(currentFiber)
        const dependsOnCurrent = Object.keys(inject).some((name) => {
          const impl = store[name]
          return provided.has(name) && impl?.fiber !== undefined && bareFiber(impl.fiber) === target
        })
        if (dependsOnCurrent) {
          found.set(other.id, other)
          queue.push(other)
        }
      }
    }
    return [...found.values()]
  }

  private async afterDeactivate(packageName: string): Promise<void> {
    this.host.refresh?.()
    if (this.host.afterDeactivate === undefined) return
    try {
      await this.host.afterDeactivate(packageName)
    } catch (cause) {
      // Best effort: cleanup must never fail the uninstall itself.
      this.host.warn?.(`could not complete plugin cleanup for ${packageName}: ${describe(cause)}`)
    }
  }

  /**
   * The live entry a package occupies: the row whose module specifier is the
   * package name (how a bundle row mounted by the boot Loader is identified),
   * else the row this controller mounted for it. A package whose row was
   * mounted at boot under a different specifier - an insert row pointing at a
   * subpath - is only resolvable while the host still calls it a profile
   * bundle; the activation record only covers this process.
   */
  private findLiveEntry(packageName: string): Entry | undefined {
    const entries = [...this.ctx.loader.entries()].filter(candidate => !candidate.options.group)
    const byName = entries.find(candidate => candidate.options.name === packageName)
    if (byName !== undefined) return byName
    const mountedId = this.activatedEntries.get(packageName)
    if (mountedId === undefined) return undefined
    return entries.find(candidate => candidate.id === mountedId)
  }

  private resolveMutable(entryId: string): Entry {
    const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === entryId)
    if (entry === undefined) {
      throw new PluginLifecycleError('unknown-entry', `Unknown plugin ${entryId}.`)
    }
    if (!this.isMutable(entry)) {
      throw new PluginLifecycleError(
        'protected-entry',
        `Plugin ${entryId} is a core capability and cannot be toggled.`,
      )
    }
    return entry
  }

  private receipt(
    action: PluginLifecycleAction,
    entryIds: readonly string[],
  ): PluginLifecycleReceipt {
    return Object.freeze({
      accepted: true as const,
      action,
      entryIds: Object.freeze([...entryIds]),
      snapshot: this.snapshot(),
    })
  }

  /** Serialize mutations: one lifecycle transition settles before the next starts. */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.host.refresh?.()
    const next = this.operation.then(operation, operation)
    this.operation = next.then(() => undefined, () => undefined)
    return next
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
