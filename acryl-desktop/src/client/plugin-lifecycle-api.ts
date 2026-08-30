/** Strict browser adapter for Desktop plugin lifecycle routes and Client Loader status. */

import type { FiberState } from '@deepseek-ai/cordis'
import type {
  PluginLifecycleEntryView,
  PluginLifecycleFiberPhase,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from '../plugin-lifecycle-contract.ts'
import {
  PLUGIN_LIFECYCLE_DISABLE_PATH,
  PLUGIN_LIFECYCLE_ENABLE_PATH,
  PLUGIN_LIFECYCLE_PATH,
  PLUGIN_LIFECYCLE_RELOAD_PATH,
} from '../plugin-lifecycle-contract.ts'

const MAX_ENTRIES = 4096
const MAX_STRING = 2048
const ACTIVE_FIBER_STATE = 2 as FiberState.ACTIVE

export interface PluginLifecycleClientLoaderEntry {
  readonly options: { readonly name: string }
  readonly fiber?: { readonly state: FiberState }
}

export interface PluginLifecycleClientLoader {
  entries(): Iterable<PluginLifecycleClientLoaderEntry>
}

export interface PluginLifecycleClientEntryView extends PluginLifecycleEntryView {
  readonly clientPhase: PluginLifecycleFiberPhase
  readonly clientMounted: boolean
}

export interface PluginLifecycleClientSnapshot {
  readonly entries: readonly PluginLifecycleClientEntryView[]
}

export interface PluginLifecycleApi {
  read(): Promise<PluginLifecycleClientSnapshot>
  enable(entryId: string): Promise<void>
  disable(entryId: string): Promise<void>
  reload(entryId?: string): Promise<void>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function parseString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING) {
    throw new Error(`acryl-desktop: invalid plugin lifecycle ${field}`)
  }
  return value
}

function parsePhase(value: unknown): PluginLifecycleFiberPhase {
  if (value === null
    || value === 'pending'
    || value === 'loading'
    || value === 'active'
    || value === 'failed'
    || value === 'unloading') return value
  throw new Error('acryl-desktop: invalid plugin lifecycle Fiber phase')
}

function parseEntry(value: unknown): PluginLifecycleEntryView {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'entryId', 'moduleName', 'enabled', 'hostPhase', 'clientPackage',
      'clientInBootGraph', 'mutable', 'protectedReason',
    ])) {
    throw new Error('acryl-desktop: invalid plugin lifecycle entry')
  }
  const clientPackage = value.clientPackage === null
    ? null
    : parseString(value.clientPackage, 'client package')
  if (typeof value.enabled !== 'boolean'
    || typeof value.clientInBootGraph !== 'boolean'
    || typeof value.mutable !== 'boolean'
    || (value.protectedReason !== null
      && (typeof value.protectedReason !== 'string' || value.protectedReason.length > MAX_STRING))) {
    throw new Error('acryl-desktop: invalid plugin lifecycle entry flags')
  }
  if (value.mutable === (value.protectedReason !== null)) {
    throw new Error('acryl-desktop: inconsistent plugin lifecycle mutation policy')
  }
  return Object.freeze({
    entryId: parseString(value.entryId, 'entry id'),
    moduleName: parseString(value.moduleName, 'module name'),
    enabled: value.enabled,
    hostPhase: parsePhase(value.hostPhase),
    clientPackage,
    clientInBootGraph: value.clientInBootGraph,
    mutable: value.mutable,
    protectedReason: value.protectedReason,
  })
}

export function parsePluginLifecycleSnapshot(value: unknown): PluginLifecycleSnapshot {
  if (!isRecord(value)
    || !hasExactKeys(value, ['entries'])
    || !Array.isArray(value.entries)
    || value.entries.length > MAX_ENTRIES) {
    throw new Error('acryl-desktop: invalid plugin lifecycle snapshot')
  }
  const entries = value.entries.map(parseEntry)
  if (new Set(entries.map(entry => entry.entryId)).size !== entries.length) {
    throw new Error('acryl-desktop: duplicate plugin lifecycle entry')
  }
  return Object.freeze({ entries: Object.freeze(entries) })
}

function parseReceipt(value: unknown): PluginLifecycleReceipt {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'accepted', 'action', 'entryIds', 'rendererReloadRequired', 'snapshot',
    ])
    || value.accepted !== true
    || (value.action !== 'enable' && value.action !== 'disable' && value.action !== 'reload')
    || !Array.isArray(value.entryIds)
    || value.entryIds.length > MAX_ENTRIES
    || typeof value.rendererReloadRequired !== 'boolean') {
    throw new Error('acryl-desktop: invalid plugin lifecycle receipt')
  }
  const entryIds = value.entryIds.map(entryId => parseString(entryId, 'receipt entry id'))
  if (new Set(entryIds).size !== entryIds.length) {
    throw new Error('acryl-desktop: duplicate plugin lifecycle receipt entry')
  }
  return Object.freeze({
    accepted: true,
    action: value.action,
    entryIds: Object.freeze(entryIds),
    rendererReloadRequired: value.rendererReloadRequired,
    snapshot: parsePluginLifecycleSnapshot(value.snapshot),
  })
}

function clientPhase(state: FiberState): PluginLifecycleFiberPhase {
  switch (state) {
    case 0: return 'pending'
    case 1: return 'loading'
    case ACTIVE_FIBER_STATE: return 'active'
    case 3: return 'failed'
    case 4: return null
    case 5: return 'unloading'
    default: return null
  }
}

async function readResponse(response: Response): Promise<unknown> {
  let value: unknown
  try {
    value = await response.json() as unknown
  } catch {
    throw new Error('acryl-desktop: plugin lifecycle response was not JSON')
  }
  if (!response.ok) {
    const message = isRecord(value) && typeof value.error === 'string'
      ? value.error
      : `Plugin lifecycle request failed (${String(response.status)}).`
    throw new Error(message)
  }
  return value
}

function post(fetcher: FetchLike, path: string, entryId?: string): Promise<Response> {
  return fetcher(path, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(entryId === undefined ? {} : { entryId }),
  })
}

function mergeClientSnapshot(
  snapshot: PluginLifecycleSnapshot,
  loader: PluginLifecycleClientLoader,
): PluginLifecycleClientSnapshot {
  const phases = new Map<string, PluginLifecycleFiberPhase>()
  for (const entry of loader.entries()) {
    phases.set(entry.options.name, entry.fiber === undefined ? null : clientPhase(entry.fiber.state))
  }
  return Object.freeze({
    entries: Object.freeze(snapshot.entries.map(entry => {
      const phase = entry.clientPackage === null ? null : phases.get(entry.clientPackage) ?? null
      return Object.freeze({
        ...entry,
        clientPhase: phase,
        clientMounted: phase !== null,
      })
    })),
  })
}

/** Create the lifecycle client with explicit fetch, Loader, and reload seams. */
export function createPluginLifecycleApi(
  loader: PluginLifecycleClientLoader,
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  reloadPage: () => void = () => { globalThis.location.reload() },
): PluginLifecycleApi {
  const mutate = async (path: string, entryId?: string): Promise<void> => {
    const receipt = parseReceipt(await readResponse(await post(fetcher, path, entryId)))
    if (!receipt.rendererReloadRequired) {
      throw new Error('acryl-desktop: lifecycle receipt omitted the required renderer reload')
    }
    reloadPage()
  }
  return Object.freeze({
    async read() {
      const response = await fetcher(PLUGIN_LIFECYCLE_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      })
      return mergeClientSnapshot(parsePluginLifecycleSnapshot(await readResponse(response)), loader)
    },
    enable: (entryId: string) => mutate(PLUGIN_LIFECYCLE_ENABLE_PATH, entryId),
    disable: (entryId: string) => mutate(PLUGIN_LIFECYCLE_DISABLE_PATH, entryId),
    reload: (entryId?: string) => mutate(PLUGIN_LIFECYCLE_RELOAD_PATH, entryId),
  })
}
