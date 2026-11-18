/**
 * The settings service (`ctx.settings`): per-namespace sections kept in one YAML file in the app's home.
 *
 * Extracted from ACRYL (`plugins/acryl-settings`). Plugins register a namespace with a schemastery schema and read the resolved value,
 * which layers schema defaults, the registrant's `base`, and the stored section, in that order. Writes are validated, atomic (write a
 * temporary file, then rename) and run one at a time in commit order; watchers see them in that order; an event announces each change.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseDocument, stringify } from 'yaml'
import type {} from '../instance/index.ts'
import { cloneJsonShaped, deepEqualJson, isPlainObject, mergeLayers } from './merge.ts'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/
export const DEFAULT_FILENAME = 'settings.yaml'

/** When a namespace's changes take effect for its owner. */
export type SettingsApplies = 'live' | 'restart'

export interface SettingsRegisterOptions<T> {
  /** Values resolved below the stored layer (for example, what the app's composition chose). */
  base?: Partial<T>
  /** When the owner applies a change; shown to settings screens. Defaults to `live`. */
  applies?: SettingsApplies
  /** Reject a resolved value the schema cannot express as invalid; a throw refuses the write that produced it. */
  validate?: (value: T) => void
}

/** One registered namespace, as a settings screen sees it. */
export interface SettingsDescriptor {
  readonly namespace: string
  /** The schemastery schema, serialized. */
  readonly schema: unknown
  readonly value: unknown
  /** Bumps on every committed write. */
  readonly revision: number
  readonly applies: SettingsApplies
  /** The stored section, when there is one. */
  readonly user?: unknown
}

/** The owner's handle on one namespace. */
export interface SettingsScope<T> {
  /** Current resolved value: schema defaults, then `base`, then the stored section. */
  get(): T
  /** Observe committed changes; callbacks run one at a time in commit order. Returns the function that stops watching. */
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
  /** Merge a patch into the stored section and persist it. */
  update(patch: object): Promise<void>
  /** Replace the stored section; `replace({})` resets every key to its base or default. */
  replace(section: object): Promise<void>
}

export interface SettingsConfig {
  /** Absolute path of the YAML file; empty or absent means `<app home>/settings.yaml`. */
  filename?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settings: Settings
  }

  interface Events {
    /** A committed change to one namespace's resolved value, after the file was written; never for an equal value. */
    'settings/updated'(namespace: string, next: unknown, prev: unknown): void
  }
}

interface Entry {
  readonly namespace: string
  readonly schema: z<unknown>
  readonly options: SettingsRegisterOptions<unknown>
  resolved: unknown
  revision: number
  readonly watchers: Set<Watcher>
}

interface Watcher {
  readonly callback: (next: unknown, prev: unknown) => void | Promise<void>
  active: boolean
}

function assertNamespace(value: string): void {
  if (!NAMESPACE_PATTERN.test(value))
    throw new TypeError(`settings: namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
}

function readDocument(filename: string): Record<string, unknown> {
  if (!existsSync(filename)) return {}
  const parsed = parseDocument(readFileSync(filename, 'utf8'), { prettyErrors: true })
  if (parsed.errors.length > 0) {
    throw new Error(
      `settings: invalid settings file ${filename}: ${parsed.errors.map((error) => error.message).join('; ')}`,
    )
  }
  const value: unknown = parsed.toJS() ?? {}
  if (!isPlainObject(value))
    throw new Error(`settings: ${filename} must be a map of namespace sections`)
  return value
}

/** The service. One instance serves one app home. */
export class Settings extends Service {
  readonly filename: string
  private document: Record<string, unknown>
  private readonly entries = new Map<string, Entry>()
  /** Writes and watcher notifications run one at a time, in commit order. */
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(ctx: Context, config: SettingsConfig = {}) {
    super(ctx, 'settings')
    this.filename = config.filename ? config.filename : join(ctx.appInstance.home, DEFAULT_FILENAME)
    this.document = readDocument(this.filename)
    ctx.effect(
      () => async () => {
        this.disposed = true
        await this.tail
      },
      'settings: settle pending writes',
    )
  }

  /** Register a namespace and return its handle. A stored section that fails the schema rejects the registration. */
  register<T>(
    namespace: string,
    schema: z<T>,
    options: SettingsRegisterOptions<T> = {},
  ): SettingsScope<T> {
    assertNamespace(namespace)
    if (this.entries.has(namespace))
      throw new Error(`settings: namespace "${namespace}" is already registered`)
    const entry: Entry = {
      namespace,
      schema: schema as z<unknown>,
      options: options as SettingsRegisterOptions<unknown>,
      resolved: undefined,
      revision: 0,
      watchers: new Set(),
    }
    entry.resolved = this.resolve(entry, this.section(namespace))
    this.entries.set(namespace, entry)
    this.ctx.effect(
      () => () => void this.entries.delete(namespace),
      `settings: namespace ${namespace}`,
    )
    return this.scopeFor<T>(entry)
  }

  /** The resolved value of a registered namespace, or `undefined` when nobody registered it. */
  get(namespace: string): unknown {
    return this.entries.get(namespace)?.resolved
  }

  /** Merge a patch into a namespace by name (for a settings route that never held the scope). An unregistered namespace is refused. */
  update(namespace: string, patch: Readonly<Record<string, unknown>>): Promise<void> {
    const entry = this.entries.get(namespace)
    if (entry === undefined)
      return Promise.reject(new Error(`settings: namespace "${namespace}" is not registered`))
    return this.commit(entry, (current) => mergeLayers(current, cloneJsonShaped({ ...patch })))
  }

  /** Every registered namespace, for settings screens. */
  describe(): SettingsDescriptor[] {
    return [...this.entries.values()].map((entry) => {
      const stored = this.document[entry.namespace]
      return {
        namespace: entry.namespace,
        schema: entry.schema.toJSON(),
        value: entry.resolved,
        revision: entry.revision,
        applies: entry.options.applies ?? 'live',
        ...(stored === undefined ? {} : { user: structuredClone(stored) }),
      }
    })
  }

  private section(namespace: string): Record<string, unknown> {
    const stored = this.document[namespace]
    if (stored === undefined) return {}
    if (!isPlainObject(stored))
      throw new Error(`settings: section "${namespace}" in ${this.filename} must be a map`)
    return stored
  }

  private resolve(entry: Entry, user: Record<string, unknown>): unknown {
    const base = (entry.options.base ?? {}) as Record<string, unknown>
    const value = entry.schema(mergeLayers(base, user))
    entry.options.validate?.(value)
    return value
  }

  private scopeFor<T>(entry: Entry): SettingsScope<T> {
    return {
      get: () => entry.resolved as T,
      watch: (callback) => {
        const watcher: Watcher = { callback: callback as Watcher['callback'], active: true }
        entry.watchers.add(watcher)
        return () => {
          watcher.active = false
          entry.watchers.delete(watcher)
        }
      },
      update: (patch) =>
        this.commit(entry, (current) =>
          mergeLayers(current, cloneJsonShaped(patch as Record<string, unknown>)),
        ),
      replace: (section) =>
        this.commit(entry, () => cloneJsonShaped(section as Record<string, unknown>)),
    }
  }

  /** One write: compute, validate, persist atomically, then notify. A refused write changes nothing. */
  private commit(
    entry: Entry,
    next: (current: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.disposed) throw new Error('settings: the service is disposed')
      const nextSection = next(this.section(entry.namespace))
      const nextValue = this.resolve(entry, nextSection)
      const prevValue = entry.resolved
      const nextDocument = { ...this.document, [entry.namespace]: nextSection }
      if (Object.keys(nextSection).length === 0) delete nextDocument[entry.namespace]
      this.persist(nextDocument)
      this.document = nextDocument
      entry.revision += 1
      entry.resolved = nextValue
      if (deepEqualJson(prevValue, nextValue)) return
      this.ctx.emit('settings/updated', entry.namespace, nextValue, prevValue)
      for (const watcher of [...entry.watchers]) {
        if (!watcher.active) continue
        try {
          await watcher.callback(nextValue, prevValue)
        } catch (cause) {
          this.ctx.logger?.error?.(
            `settings: watcher for "${entry.namespace}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
    }
    const result = this.tail.then(run, run)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private persist(document: Record<string, unknown>): void {
    mkdirSync(dirname(this.filename), { recursive: true })
    const temporary = `${this.filename}.${String(process.pid)}.tmp`
    writeFileSync(temporary, stringify(document), { mode: 0o600 })
    renameSync(temporary, this.filename)
  }
}

/** The plugin: mount it after `instance`. */
export const settings = {
  name: 'settings',
  inject: ['appInstance'],
  apply(ctx: Context, config: SettingsConfig) {
    new Settings(ctx, config ?? {})
  },
}

export { z }
