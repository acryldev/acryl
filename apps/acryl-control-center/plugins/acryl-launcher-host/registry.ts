/** The public Blend registry as the screen's store lists it: only reads (the same index `acryl new --from` and the terminal's "Install a Blend" use). */
import { BLEND_SOURCE, type BlendView } from './contract.ts'

export const REGISTRY_INDEX = 'https://acrylblends.github.io/registry/index.json'
/** Blends released by people outside the ACRYL project and found on GitHub by the registry's hourly sync (origin `community`, each with its `source`). */
export const REGISTRY_DISCOVERED = 'https://acrylblends.github.io/registry/discovered.json'
const TIMEOUT_MS = 10_000

export class RegistryUnavailable extends Error {}

type Fetch = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string => typeof value === 'string' ? value : ''

/** The `entries` of one registry list; `RegistryUnavailable` in words a person can act on. */
async function entriesOf(fetchImpl: Fetch, url: string): Promise<readonly unknown[]> {
  let body: unknown
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) throw new RegistryUnavailable(`The registry answered HTTP ${String(response.status)}.`)
    body = await response.json()
  } catch (cause) {
    if (cause instanceof RegistryUnavailable) throw cause
    throw new RegistryUnavailable('The registry could not be read. Check the network and try again.')
  }
  const entries = record(body)?.entries
  if (!Array.isArray(entries)) throw new RegistryUnavailable('The registry answered, but its list could not be read.')
  return entries
}

/**
 * The Blends an ACRYL app can be made from (registry entries whose runtime is `acrylblends`), by name: the public registry's, and the community ones
 * the registry found on GitHub (made from their `source`). The community list is optional: when it cannot be read, the store still lists the rest.
 */
export async function readBlends(fetchImpl: Fetch = (input, init) => fetch(input, init), url: string = REGISTRY_INDEX, discovered: string | undefined = REGISTRY_DISCOVERED): Promise<readonly BlendView[]> {
  const blends: BlendView[] = []
  const ids = new Set<string>()
  for (const raw of await entriesOf(fetchImpl, url)) {
    const entry = record(raw)
    if (entry === undefined || entry.runtime !== 'acrylblends' || typeof entry.id !== 'string' || entry.id === '') continue
    ids.add(entry.id)
    blends.push({ id: entry.id, name: text(entry.name) || entry.id, version: text(entry.version), category: text(entry.category), description: text(entry.description), origin: entry.origin === 'official' ? 'official' : 'community' })
  }
  const community = discovered === undefined ? [] : await entriesOf(fetchImpl, discovered).catch(() => [])
  for (const raw of community) {
    const entry = record(raw)
    // A community Blend is made from its GitHub release; one without a usable source, or with an id the public registry has, is not offered.
    if (entry === undefined || entry.runtime !== 'acrylblends' || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) continue
    const source = text(entry.source)
    if (!BLEND_SOURCE.test(source)) continue
    ids.add(entry.id)
    // Its place in the store's categories (the sync reads it from the Blend's own package.json keywords), else the word its blend.yaml carries.
    const placement = record(entry.placement)
    const category = text(placement?.category) === '' ? text(entry.category) : [text(placement?.category), text(placement?.subcategory)].filter(Boolean).join(' › ')
    const publisher = text(entry.publisher)
    blends.push({ id: entry.id, name: text(entry.name) || entry.id, version: text(entry.version), category, description: text(entry.description), origin: 'community', source, ...(publisher === '' ? {} : { publisher }) })
  }
  return blends.sort((a, b) => a.name.localeCompare(b.name))
}
