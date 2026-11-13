/** The public Blend registry as the screen's store lists it: only reads (the same index `acryl new --from` and the terminal's "Install a Blend" use). */
import type { BlendView } from './contract.ts'

export const REGISTRY_INDEX = 'https://acrylblends.github.io/registry/index.json'
const TIMEOUT_MS = 10_000

export class RegistryUnavailable extends Error {}

type Fetch = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string => typeof value === 'string' ? value : ''

/** The Blends an ACRYL app can be made from (registry entries whose runtime is `acrylblends`), by name. Throws `RegistryUnavailable` in words a person can act on. */
export async function readBlends(fetchImpl: Fetch = (input, init) => fetch(input, init), url: string = REGISTRY_INDEX): Promise<readonly BlendView[]> {
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
  const blends: BlendView[] = []
  for (const raw of entries) {
    const entry = record(raw)
    if (entry === undefined || entry.runtime !== 'acrylblends' || typeof entry.id !== 'string' || entry.id === '') continue
    blends.push({ id: entry.id, name: text(entry.name) || entry.id, version: text(entry.version), category: text(entry.category), description: text(entry.description) })
  }
  return blends.sort((a, b) => a.name.localeCompare(b.name))
}
