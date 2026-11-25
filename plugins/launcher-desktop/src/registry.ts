/** The public Blend registry as the screen's store lists it: only reads (the same index `acryl new --from` and the terminal's "Install a Blend" use). */
import { BLEND_SOURCE, type BlendPlace, type BlendView, type PluginCatalogEntry, type PluginCatalogView, type PluginKindView } from './contract.ts'

export const REGISTRY_INDEX = 'https://acrylblends.github.io/registry/index.json'
/** Blends released by people outside the ACRYL project and found on GitHub by the registry's hourly sync (origin `community`, each with its `source`). */
export const REGISTRY_DISCOVERED = 'https://acrylblends.github.io/registry/discovered.json'
/** Where the store files each Blend (category, subcategory, its page, its screenshot) and the store's categories in order; the website writes it. */
export const REGISTRY_PLACEMENT = 'https://acrylblends.github.io/registry/placement.json'
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

interface Placed {
  readonly place: BlendPlace
  readonly page?: string
  readonly screenshot?: string
}

const httpsUrl = (value: unknown): string | undefined => typeof value === 'string' && /^https:\/\/\S+$/u.test(value) ? value : undefined

/**
 * Each Blend's place in the store, by id, from the registry's placement.json. Optional: when it cannot be read, the store lists the Blends without
 * categories (the list itself comes from the index).
 */
async function placementsOf(fetchImpl: Fetch, url: string): Promise<ReadonlyMap<string, Placed>> {
  const placed = new Map<string, Placed>()
  let body: unknown
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return placed
    body = await response.json()
  } catch {
    return placed
  }
  const order = new Map<string, number>()
  const taxonomy = record(body)?.taxonomy
  if (Array.isArray(taxonomy)) taxonomy.forEach((raw, at) => { const name = text(record(raw)?.name); if (name !== '') order.set(name, at) })
  const entries = record(record(body)?.entries)
  for (const [id, raw] of Object.entries(entries ?? {})) {
    const entry = record(raw)
    const category = text(entry?.category)
    if (entry === undefined || category === '') continue
    const page = httpsUrl(entry.page)
    const screenshot = httpsUrl(entry.screenshot)
    placed.set(id, { place: { category, subcategory: text(entry.subcategory), order: order.get(category) ?? Number.MAX_SAFE_INTEGER }, ...(page === undefined ? {} : { page }), ...(screenshot === undefined ? {} : { screenshot }) })
  }
  return placed
}

/**
 * The Blends an ACRYL app can be made from (registry entries whose runtime is `acrylblends`), by name: the public registry's, and the community ones
 * the registry found on GitHub (made from their `source`). The community list is optional: when it cannot be read, the store still lists the rest.
 */
export async function readBlends(fetchImpl: Fetch = (input, init) => fetch(input, init), url: string = REGISTRY_INDEX, discovered: string | undefined = REGISTRY_DISCOVERED, placement: string | undefined = REGISTRY_PLACEMENT): Promise<readonly BlendView[]> {
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
  const placed = placement === undefined ? new Map<string, Placed>() : await placementsOf(fetchImpl, placement)
  return blends.map(blend => {
    const where = placed.get(blend.id)
    return where === undefined ? blend : { ...blend, ...where, category: [where.place.category, where.place.subcategory].filter(Boolean).join(' › ') }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** The public Cordis plugin registry (cordisplugins.github.io): its list of plugins, and the shared catalog the kinds and domains are named in (spec 053). */
export const PLUGIN_REGISTRY_INDEX = 'https://cordisplugins.github.io/registry/index.json'
export const PLUGIN_CATEGORIES = 'https://cordisplugins.github.io/categories.json'

/** The line a registry entry names for pulling (`/plugin pull github:owner/repo@1.2.3`), as the source `Pull a plugin` takes. */
const PULL_LINE = /^\/plugin pull (github:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}@[A-Za-z0-9._-]{1,64})$/u

/**
 * The shared catalog's names for kinds, domains and components. Optional: when it cannot be read, plugins are listed without kinds or domains
 * (the registry's list itself is enough to browse and add). It is about a megabyte, so only the names the screen needs are kept.
 */
async function catalogNames(fetchImpl: Fetch, url: string): Promise<{ kinds: readonly PluginKindView[], domains: ReadonlyMap<string, { category: string, sub: string }>, components: ReadonlyMap<string, string> }> {
  const none = { kinds: [], domains: new Map<string, { category: string, sub: string }>(), components: new Map<string, string>() }
  let body: unknown
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return none
    body = await response.json()
  } catch {
    return none
  }
  const root = record(body)
  const kinds = (Array.isArray(root?.kinds) ? root.kinds : []).flatMap((raw): PluginKindView[] => {
    const kind = record(raw)
    return typeof kind?.slug === 'string' && kind.slug !== '' ? [{ slug: kind.slug, name: text(kind.name) || kind.slug, description: text(kind.description) }] : []
  })
  const domains = new Map<string, { category: string, sub: string }>()
  const components = new Map<string, string>()
  for (const rawCategory of Array.isArray(root?.categories) ? root.categories : []) {
    const category = record(rawCategory)
    for (const rawSub of Array.isArray(category?.subcategories) ? category.subcategories : []) {
      const sub = record(rawSub)
      if (typeof sub?.id !== 'string') continue
      domains.set(sub.id, { category: text(category?.name), sub: text(sub.name) })
      for (const rawComponent of Array.isArray(sub.components) ? sub.components : []) {
        const component = record(rawComponent)
        if (typeof component?.id === 'string') components.set(component.id, text(component.name))
      }
    }
  }
  return { kinds, domains, components }
}

/**
 * The Cordis plugins of the public registry, with each one's kind and domain named by the shared catalog, by name. A plugin whose kind the catalog does not
 * know is listed without one (unclassified). `RegistryUnavailable` when the plugin list itself cannot be read.
 */
export async function readPluginCatalog(fetchImpl: Fetch = (input, init) => fetch(input, init), indexUrl: string = PLUGIN_REGISTRY_INDEX, categoriesUrl: string = PLUGIN_CATEGORIES): Promise<PluginCatalogView> {
  const [entries, names] = await Promise.all([entriesOf(fetchImpl, indexUrl), catalogNames(fetchImpl, categoriesUrl)])
  const kinds = new Set(names.kinds.map(kind => kind.slug))
  const plugins: PluginCatalogEntry[] = []
  for (const raw of entries) {
    const entry = record(raw)
    if (entry === undefined || typeof entry.id !== 'string' || entry.id === '' || typeof entry.name !== 'string' || entry.name === '') continue
    const domain = typeof entry.domain === 'string' ? names.domains.get(entry.domain) : undefined
    const componentName = typeof entry.component === 'string' ? names.components.get(entry.component) : undefined
    const page = httpsUrl(entry.page)
    const source = PULL_LINE.exec(text(entry.acrylPull))?.[1]
    plugins.push({
      id: entry.id,
      name: entry.name,
      description: text(entry.description),
      ...typeof entry.kind === 'string' && kinds.has(entry.kind) ? { kind: entry.kind } : {},
      ...domain === undefined ? {} : { domain: { id: String(entry.domain), ...domain } },
      ...componentName === undefined ? {} : { component: { id: String(entry.component), name: componentName } },
      compatibility: text(entry.compatibility),
      origin: entry.origin === 'official' ? 'official' : 'community',
      publisher: text(entry.publisher),
      version: text(entry.version),
      repo: httpsUrl(entry.repo) ?? '',
      ...page === undefined ? {} : { page },
      ...source === undefined ? {} : { source },
    })
  }
  return { kinds: names.kinds, plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)) }
}
