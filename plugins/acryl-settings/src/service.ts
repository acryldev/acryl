/**
 * The ACRYL-owned settings service (`ctx.acrylSettings`): per-namespace sections kept in one YAML file in the ACRYL home.
 *
 * Plugins register a namespace schema and read the resolved value, which layers schema defaults, the registrant's
 * `base`, and the stored user section, in that order. The call shape (`register`, `get`, and the scope's `get`, `watch`,
 * `update`, `replace`) is the one ACRYL plugins used against the DeepSeek Harness settings service before 0.2, so their
 * call sites keep their shape; only the service name changed. This service owns surface preferences (shortcuts, desktop
 * shell mode, notifications, market), not harness business configuration, and does not read or write the harness home.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseDocument, stringify } from 'yaml'
import { cloneJsonShaped, deepEqualJson, isPlainObject, mergeLayers } from './merge.ts'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/
const DEFAULT_FILENAME = 'acryl-settings.yaml'

/** When a namespace's changes take effect for its owner. */
export type SettingsApplies = 'live' | 'restart'

/** Registration options beyond the namespace schema. */
export interface SettingsRegisterOptions<T> {
  /** Composition-layer values resolved below the user layer. */
  base?: Partial<T>
  /** Owner's effect timing, surfaced to configuration UIs; defaults to `live`. */
  applies?: SettingsApplies
  /** Reject a resolved section the schema cannot express as invalid; a throw refuses the write that produced it. */
  validate?: (value: T) => void
}

/** One registered namespace as surfaced to configuration UIs. */
export interface SettingsDescriptor {
  readonly namespace: string
  /** Serialized schemastery schema. */
  readonly schema: unknown
  readonly value: unknown
  /** Monotonic revision of the stored user section; bumps on every committed write. */
  readonly revision: number
  readonly applies: SettingsApplies
  /** The stored user section, when one exists. */
  readonly user?: unknown
}

/** Owner-facing handle for one registered namespace. */
export interface SettingsScope<T> {
  /** Current resolved value: schema defaults, then `base`, then the user layer. */
  get(): T
  /** Observe committed changes; callbacks run asynchronously, one at a time, in commit order. */
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
  /** Merge a plain-object patch into this namespace's stored section and persist it. */
  update(patch: object): Promise<void>
  /** Replace the stored section wholesale; `replace({})` resets every key to its base or default. */
  replace(section: object): Promise<void>
}

/** Where the service keeps its file. */
export interface Config {
  /** Absolute path of the YAML file. Empty means `<ACRYL home>/acryl-settings.yaml`. */
  filename: string
}

/** Validated plugin configuration. */
export const Config: z<Config> = z.object({
  filename: z.string().default('').description('Absolute path of the settings file; empty means the ACRYL home.'),
})

/**
 * The composition-root `appInstance` service. Every plugin that augments `Context.appInstance` declares exactly this shape
 * (see `acryl-agent-control`), so the augmentations agree in any program that loads several of them; this plugin reads `home`.
 */
interface AppInstanceService {
  readonly home: string
  readonly dshHome: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrylSettings: AcrylSettings
    appInstance: AppInstanceService
  }

  interface Events {
    /**
     * Committed change to one registered namespace's resolved value, emitted after the file was written and never when
     * the resolved value is deep-equal. Listener failures are contained by Cordis like any other event.
     * @mode emit
     */
    'acrylSettings/updated'(namespace: string, next: unknown, prev: unknown): void
  }
}

/** Stable Cordis plugin name. */
export const name = 'acryl-settings'

/** The ACRYL home is chosen once at the composition root and provided before any engine row mounts. */
export const inject = ['appInstance']

interface Entry {
  readonly namespace: string
  readonly schema: z<unknown>
  readonly options: SettingsRegisterOptions<unknown>
  resolved: unknown
  revision: number
  watchers: Set<Watcher>
}

interface Watcher {
  readonly callback: (next: unknown, prev: unknown) => void | Promise<void>
  active: boolean
}

function assertNamespace(value: string): void {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`acryl-settings: namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
}

function readDocument(filename: string): Record<string, unknown> {
  if (!existsSync(filename)) return {}
  const parsed = parseDocument(readFileSync(filename, 'utf8'), { prettyErrors: true })
  if (parsed.errors.length > 0) {
    throw new Error(`acryl-settings: invalid settings file ${filename}: ${parsed.errors.map(error => error.message).join('; ')}`)
  }
  const value: unknown = parsed.toJS() ?? {}
  if (!isPlainObject(value)) throw new Error(`acryl-settings: ${filename} must be a map of namespace sections`)
  return value
}

/** The service class. One instance serves one ACRYL home. */
export class AcrylSettings extends Service {
  readonly filename: string
  private document: Record<string, unknown>
  private readonly entries = new Map<string, Entry>()
  /** Writes and watcher notifications run one at a time in commit order. */
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'acrylSettings')
    this.filename = config.filename === '' ? join(ctx.appInstance.home, DEFAULT_FILENAME) : config.filename
    this.document = readDocument(this.filename)
    ctx.effect(() => async () => {
      this.disposed = true
      await this.tail
    }, 'acryl-settings: settle pending writes')
  }

  /** Register one namespace and return its handle. A stored section that fails the schema rejects the registration. */
  register<T>(namespace: string, schema: z<T>, options: SettingsRegisterOptions<T> = {}): SettingsScope<T> {
    assertNamespace(namespace)
    if (this.entries.has(namespace)) throw new Error(`acryl-settings: namespace "${namespace}" is already registered`)
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
    this.ctx.effect(() => () => { this.entries.delete(namespace) }, `acryl-settings: namespace ${namespace}`)
    return this.scopeFor<T>(entry)
  }

  /** The resolved value of a registered namespace, or `undefined` when nobody registered it. */
  get(namespace: string): unknown {
    return this.entries.get(namespace)?.resolved
  }

  /** Every registered namespace, for configuration UIs. */
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
    if (!isPlainObject(stored)) throw new Error(`acryl-settings: section "${namespace}" in ${this.filename} must be a map`)
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
      update: (patch) => this.commit(entry, (current) => mergeLayers(current, cloneJsonShaped(patch as Record<string, unknown>))),
      replace: (section) => this.commit(entry, () => cloneJsonShaped(section as Record<string, unknown>)),
    }
  }

  /** Run one write: compute, validate, persist atomically, then notify watchers. A refused write changes nothing. */
  private commit(entry: Entry, next: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.disposed) throw new Error('acryl-settings: service is disposed')
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
      this.ctx.emit('acrylSettings/updated', entry.namespace, nextValue, prevValue)
      for (const watcher of [...entry.watchers]) {
        if (!watcher.active) continue
        try {
          await watcher.callback(nextValue, prevValue)
        } catch (cause) {
          this.ctx.logger.error(`acryl-settings: watcher for "${entry.namespace}" failed: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
    }
    const result = this.tail.then(run, run)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  private persist(document: Record<string, unknown>): void {
    mkdirSync(dirname(this.filename), { recursive: true })
    const temporary = `${this.filename}.${String(process.pid)}.tmp`
    writeFileSync(temporary, stringify(document), { mode: 0o600 })
    renameSync(temporary, this.filename)
  }
}

/** Mount the service on this plugin's fiber. */
export function apply(ctx: Context, config: Config): void {
  new AcrylSettings(ctx, config)
}
