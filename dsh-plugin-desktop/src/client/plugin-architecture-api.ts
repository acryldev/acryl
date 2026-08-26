/** Client boundary joining separate native Host and renderer Cordis snapshots. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import {
  PLUGIN_ARCHITECTURE_PATH,
  type CordisDependencyStatus,
  type CordisDependencyView,
  type CordisEffectView,
  type CordisFiberView,
  type CordisPlane,
  type CordisPlaneSnapshot,
  type CordisServiceView,
  type PluginArchitectureSnapshot,
} from '../plugin-architecture-contract.ts'
import { inspectCordisContext } from '../plugin-architecture-inspector.ts'

const MAX_FIBERS = 2_048
const MAX_SERVICES = 4_096
const MAX_EFFECTS = 512
const MAX_DEPTH = 12
const MAX_STRING = 512

type FetchLike = typeof globalThis.fetch

export interface PluginArchitectureApi {
  read(): Promise<PluginArchitectureSnapshot>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function stringValue(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > MAX_STRING) {
    throw new Error(`dsh-plugin-desktop: invalid Cordis architecture ${field}`)
  }
  return value
}

function uidValue(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture Fiber UID')
  }
  return value as number
}

function effectValue(value: unknown, depth: number, budget: { remaining: number }): CordisEffectView {
  if (depth > MAX_DEPTH || --budget.remaining < 0 || !isRecord(value)
    || !hasExactKeys(value, ['label', 'children']) || !Array.isArray(value.children)) {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture effect')
  }
  return Object.freeze({
    label: stringValue(value.label, 'effect label', true),
    children: Object.freeze(value.children.map(child => effectValue(child, depth + 1, budget))),
  })
}

function dependencyValue(value: unknown): CordisDependencyView {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'status', 'providerFiberUid'])) {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture dependency')
  }
  const status = value.status
  if (status !== 'resolved' && status !== 'available' && status !== 'missing') {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture dependency status')
  }
  const providerFiberUid = uidValue(value.providerFiberUid, true)
  if ((status === 'resolved') !== (providerFiberUid !== null)) {
    throw new Error('dsh-plugin-desktop: inconsistent Cordis architecture dependency')
  }
  return Object.freeze({
    name: stringValue(value.name, 'dependency name'),
    status: status as CordisDependencyStatus,
    providerFiberUid,
  })
}

function fiberValue(value: unknown): CordisFiberView {
  if (!isRecord(value) || !hasExactKeys(value, [
    'uid', 'name', 'phase', 'parentUid', 'loaderEntryId', 'moduleName',
    'dependencies', 'providedServices', 'effects',
  ]) || !Array.isArray(value.dependencies) || !Array.isArray(value.providedServices)
    || !Array.isArray(value.effects) || value.effects.length > MAX_EFFECTS) {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture Fiber')
  }
  const phase = value.phase
  if (phase !== 'pending' && phase !== 'loading' && phase !== 'active'
    && phase !== 'failed' && phase !== 'unloading') {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture Fiber phase')
  }
  const nullableString = (field: unknown, name: string): string | null => field === null
    ? null
    : stringValue(field, name)
  const providedServices = value.providedServices.map(service => stringValue(service, 'service name'))
  if (new Set(providedServices).size !== providedServices.length) {
    throw new Error('dsh-plugin-desktop: duplicate Cordis architecture provided service')
  }
  const effectBudget = { remaining: MAX_EFFECTS }
  return Object.freeze({
    uid: uidValue(value.uid) as number,
    name: stringValue(value.name, 'Fiber name'),
    phase,
    parentUid: uidValue(value.parentUid, true),
    loaderEntryId: nullableString(value.loaderEntryId, 'Loader entry'),
    moduleName: nullableString(value.moduleName, 'module name'),
    dependencies: Object.freeze(value.dependencies.map(dependencyValue)),
    providedServices: Object.freeze(providedServices),
    effects: Object.freeze(value.effects.map(effect => effectValue(effect, 0, effectBudget))),
  })
}

function serviceValue(value: unknown): CordisServiceView {
  if (!isRecord(value) || !hasExactKeys(value, [
    'name', 'providerFiberUid', 'providerName', 'providerPhase',
  ])) throw new Error('dsh-plugin-desktop: invalid Cordis architecture service')
  const providerPhase = value.providerPhase
  if (providerPhase !== 'pending' && providerPhase !== 'loading' && providerPhase !== 'active'
    && providerPhase !== 'failed' && providerPhase !== 'unloading') {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture service phase')
  }
  return Object.freeze({
    name: stringValue(value.name, 'service name'),
    providerFiberUid: uidValue(value.providerFiberUid) as number,
    providerName: stringValue(value.providerName, 'service provider'),
    providerPhase,
  })
}

export function parseCordisPlaneSnapshot(value: unknown, expectedPlane: CordisPlane): CordisPlaneSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['plane', 'fibers', 'services'])
    || value.plane !== expectedPlane || !Array.isArray(value.fibers)
    || !Array.isArray(value.services) || value.fibers.length > MAX_FIBERS
    || value.services.length > MAX_SERVICES) {
    throw new Error('dsh-plugin-desktop: invalid Cordis architecture snapshot')
  }
  const fibers = value.fibers.map(fiberValue)
  if (new Set(fibers.map(fiber => fiber.uid)).size !== fibers.length) {
    throw new Error('dsh-plugin-desktop: duplicate Cordis architecture Fiber UID')
  }
  return Object.freeze({
    plane: expectedPlane,
    fibers: Object.freeze(fibers),
    services: Object.freeze(value.services.map(serviceValue)),
  })
}

async function responseValue(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = isRecord(value) && typeof value.error === 'string'
      ? value.error
      : `request failed (${String(response.status)})`
    throw new Error(message)
  }
  return value
}

/** Create a live two-plane inspector. Host is fetched; Client is projected locally. */
export function createPluginArchitectureApi(
  ctx: Context,
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): PluginArchitectureApi {
  return Object.freeze({
    async read() {
      const response = await fetcher(PLUGIN_ARCHITECTURE_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      })
      const host = parseCordisPlaneSnapshot(await responseValue(response), 'host')
      const client = inspectCordisContext(ctx, 'client')
      return Object.freeze({ host, client })
    },
  })
}
