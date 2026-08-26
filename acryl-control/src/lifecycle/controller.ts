/** Host-neutral lifecycle authority over explicitly managed Loader entries. */

import type { Context, Fiber } from '@deepseek-ai/cordis'

export type PluginLifecycleFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

export type PluginLifecycleAction = 'enable' | 'disable' | 'reload'

/** One Loader entry with its current lifecycle projection. */
export interface PluginLifecycleEntryView {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly hostPhase: PluginLifecycleFiberPhase
  readonly mutable: boolean
  readonly protectedReason: string | null
}

/** Point-in-time lifecycle projection. */
export interface PluginLifecycleSnapshot {
  readonly entries: readonly PluginLifecycleEntryView[]
}

/** Host mutation acceptance returned after settlement. */
export interface PluginLifecycleReceipt {
  readonly accepted: true
  readonly action: PluginLifecycleAction
  readonly entryIds: readonly string[]
  readonly snapshot: PluginLifecycleSnapshot
}

/** One Loader entry admitted to safe user lifecycle mutation. */
export interface ManagedLifecycleEntry {
  readonly entryId: string
  readonly moduleName: string
}

/** Persistence adapter for enablement overrides. */
export interface LifecyclePersistence {
  setEnabled(entryId: string, enabled: boolean): Promise<void>
}

/** Inputs required by the host-neutral lifecycle controller. */
export interface AcrPluginLifecycleBootstrap {
  readonly mutableEntries: Readonly<Record<string, ManagedLifecycleEntry>>
  readonly persistence: LifecyclePersistence
}

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

const FIBER_PHASE: Record<number, PluginLifecycleFiberPhase> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

const PROTECTED_REASON =
  'This internal or dependency-managed Loader entry is not admitted to safe user lifecycle control.'

interface LifecycleEntry {
  readonly id: string
  readonly options: { readonly name: string; readonly group?: boolean | null }
  readonly disabled: boolean
  readonly fiber?: Fiber
  update(options: { readonly disabled?: boolean | null }): Promise<void>
}

interface LifecycleLoader {
  entries(): Generator<LifecycleEntry, void, void>
}

function phaseOf(fiber: Fiber | undefined): PluginLifecycleFiberPhase {
  return fiber === undefined ? null : FIBER_PHASE[fiber.state as number] ?? null
}

function loaderOf(ctx: Context): LifecycleLoader {
  const loader = ctx.get('loader') as LifecycleLoader | undefined
  if (loader === undefined) throw new Error('acryl-control: loader service is not available')
  return loader
}

/** Host-neutral controller over `ctx.loader` and an injectable mutation policy. */
export class AcrPluginLifecycleController {
  private operation = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    private readonly bootstrap: AcrPluginLifecycleBootstrap,
  ) {}

  /** Project every non-group Loader entry and its mutation policy. */
  snapshot(): PluginLifecycleSnapshot {
    const entries: PluginLifecycleEntryView[] = []
    for (const entry of loaderOf(this.ctx).entries()) {
      if (entry.options.group) continue
      const policy = this.bootstrap.mutableEntries[entry.id]
      const mutable = policy !== undefined && policy.moduleName === entry.options.name
      entries.push(Object.freeze({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        hostPhase: phaseOf(entry.fiber),
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
        await this.bootstrap.persistence.setEnabled(managedId, enabled)
      } catch (cause) {
        throw new PluginLifecycleError(
          'persistence-failed',
          `Unable to persist plugin lifecycle change: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      try {
        await entry.update({ disabled: !enabled })
      } catch (cause) {
        try {
          await this.bootstrap.persistence.setEnabled(managedId, wasEnabled)
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
      return this.receipt(enabled ? 'enable' : 'disable', [entryId])
    })
  }

  /** Restart one managed entry, or every currently enabled managed entry. */
  reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.exclusive(async () => {
      const entries = entryId === undefined
        ? Object.keys(this.bootstrap.mutableEntries)
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
      return this.receipt('reload', entries.map(entry => entry.id))
    })
  }

  private resolveManaged(entryId: string): { entry: LifecycleEntry; managedId: string } {
    const policy = this.bootstrap.mutableEntries[entryId]
    if (policy === undefined) {
      const exists = [...loaderOf(this.ctx).entries()].some(entry => entry.id === entryId)
      throw new PluginLifecycleError(
        exists ? 'protected-entry' : 'unknown-entry',
        exists ? `Plugin ${entryId} is protected.` : `Unknown plugin ${entryId}.`,
      )
    }
    const entry = [...loaderOf(this.ctx).entries()].find(candidate => candidate.id === entryId)
    if (entry === undefined) {
      throw new PluginLifecycleError('unknown-entry', `Unknown plugin ${entryId}.`)
    }
    if (entry.options.name !== policy.moduleName) {
      throw new PluginLifecycleError(
        'entry-changed',
        `Plugin ${entryId} no longer has its managed package identity.`,
      )
    }
    return { entry, managedId: policy.entryId }
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

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation)
    this.operation = next.then(() => undefined, () => undefined)
    return next
  }
}
