/** Host lifecycle authority for explicitly managed Desktop Loader entries. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {
  PluginLifecycleEntryView,
  PluginLifecycleFiberPhase,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './plugin-lifecycle-contract.ts'
import {
  MANAGED_PLUGIN_LIFECYCLE_ENTRIES,
  setPluginLifecycleEntryEnabled,
  type ManagedPluginLifecycleEntryId,
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

const PROTECTED_REASON = 'This internal or dependency-managed Loader entry is not admitted to safe user lifecycle control.'

/** Stable failures that private routes and human commands may present. */
export type PluginLifecycleErrorCode =
  | 'unknown-entry'
  | 'protected-entry'
  | 'entry-changed'
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
  private readonly resolvePackageJson: ((specifier: string) => string) | undefined

  constructor(
    private readonly ctx: Context,
    private readonly bootstrap: PluginLifecycleStateBootstrap,
  ) {
    if (ctx.baseUrl !== undefined) {
      const require = createRequire(ctx.baseUrl)
      this.resolvePackageJson = specifier => require.resolve(`${specifier}/package.json`)
    }
  }

  /** Read every non-group Host entry and current Client graph membership. */
  snapshot(): PluginLifecycleSnapshot {
    const graph = this.ctx.get('clientModules')?.graph()
    const clientGraph = new Set(graph?.entries.map(entry => entry.id) ?? [])
    const entries: PluginLifecycleEntryView[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const policy = MANAGED_PLUGIN_LIFECYCLE_ENTRIES[entry.id as ManagedPluginLifecycleEntryId]
      const clientPackage = this.clientPackage(entry.options.name, clientGraph)
      const mutable = policy !== undefined && policy.moduleName === entry.options.name
      entries.push(Object.freeze({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        hostPhase: phaseOf(entry),
        clientPackage,
        clientInBootGraph: clientPackage !== null && clientGraph.has(clientPackage),
        mutable,
        protectedReason: mutable ? null : PROTECTED_REASON,
      }))
    }
    return Object.freeze({ entries: Object.freeze(entries) })
  }

  /** Persist and apply one managed entry enablement transactionally. */
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const { entry, managedId } = this.resolveManaged(entryId)
      const wasEnabled = !entry.disabled
      if (wasEnabled === enabled) {
        throw new PluginLifecycleError(
          enabled ? 'already-enabled' : 'already-disabled',
          `Plugin ${entryId} is already ${enabled ? 'enabled' : 'disabled'}.`,
        )
      }
      try {
        await setPluginLifecycleEntryEnabled(this.bootstrap, managedId, enabled)
      } catch (cause) {
        throw new PluginLifecycleError(
          'persistence-failed',
          `Unable to persist plugin lifecycle change: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      try {
        await entry.update({ disabled: !enabled })
        await Promise.resolve()
      } catch (cause) {
        try {
          await setPluginLifecycleEntryEnabled(this.bootstrap, managedId, wasEnabled)
        } catch (rollbackCause) {
          throw new PluginLifecycleError(
            'persistence-failed',
            `Plugin lifecycle failed and persistence rollback also failed: ${cause instanceof Error ? cause.message : String(cause)}; ${rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause)}`,
          )
        }
        throw new PluginLifecycleError(
          'lifecycle-failed',
          `Plugin lifecycle change failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      return this.receipt(enabled ? 'enable' : 'disable', [entryId], true)
    })
  }

  /** Restart one managed entry, or every currently enabled managed entry. */
  reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entries = entryId === undefined
        ? Object.keys(MANAGED_PLUGIN_LIFECYCLE_ENTRIES)
          .map(id => this.resolveManaged(id).entry)
          .filter(entry => !entry.disabled)
        : [this.resolveManaged(entryId).entry]
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

  private resolveManaged(entryId: string): {
    readonly entry: Entry
    readonly managedId: ManagedPluginLifecycleEntryId
  } {
    const policy = MANAGED_PLUGIN_LIFECYCLE_ENTRIES[entryId as ManagedPluginLifecycleEntryId]
    if (policy === undefined) {
      const exists = [...this.ctx.loader.entries()].some(entry => entry.id === entryId)
      throw new PluginLifecycleError(
        exists ? 'protected-entry' : 'unknown-entry',
        exists ? `Plugin ${entryId} is protected.` : `Unknown plugin ${entryId}.`,
      )
    }
    const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === entryId)
    if (entry === undefined) {
      throw new PluginLifecycleError('unknown-entry', `Unknown plugin ${entryId}.`)
    }
    if (entry.options.name !== policy.moduleName) {
      throw new PluginLifecycleError('entry-changed', `Plugin ${entryId} no longer has its managed package identity.`)
    }
    return { entry, managedId: policy.entryId }
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
