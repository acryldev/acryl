/** What the plugin catalog shows, worked out from the Host's list (spec 053 E): pure functions, no DOM, like `model.ts`. */
import type { PluginCatalogEntry, PluginCatalogView, PluginKindView } from '../contract.ts'

export type KindFilter = 'all' | 'unclassified' | string
export type OriginFilter = 'all' | PluginCatalogEntry['origin']

export interface PluginFilter {
  readonly kind: KindFilter
  /** A domain category's code (`02`) and, within it, one subcategory's code (`02-06`); both absent: every domain. */
  readonly category?: string
  readonly sub?: string
  readonly origin: OriginFilter
  readonly search: string
}

export interface KindChip { readonly kind: PluginKindView, readonly count: number }

/** The kinds that hold at least one plugin, in the catalog's order: an empty shelf is not shown. */
export function kindChips(view: PluginCatalogView): readonly KindChip[] {
  return view.kinds.map(kind => ({ kind, count: view.plugins.filter(plugin => plugin.kind === kind.slug).length })).filter(chip => chip.count > 0)
}

export const unclassifiedCount = (view: PluginCatalogView): number => view.plugins.filter(plugin => plugin.kind === undefined).length

export interface DomainSub { readonly id: string, readonly name: string, readonly count: number }
export interface DomainGroup { readonly id: string, readonly name: string, readonly count: number, readonly subs: readonly DomainSub[] }

/** A domain's category code: `02-06` is in category `02`. */
export const categoryOf = (domainId: string): string => domainId.split('-')[0] ?? domainId

/**
 * Every domain the shared catalog has, with its code, in its order, each with how many of `plugins` it holds: an empty one is listed with a count of 0 (the
 * screen greys it), as the Blends store lists its categories. When the shared catalog could not be read, the domains the plugins sit in.
 */
export function domainTree(view: PluginCatalogView, plugins: readonly PluginCatalogEntry[]): readonly DomainGroup[] {
  const counts = new Map<string, number>()
  for (const plugin of plugins) if (plugin.domain !== undefined) counts.set(plugin.domain.id, (counts.get(plugin.domain.id) ?? 0) + 1)
  const known = view.domains.length > 0
    ? view.domains
    : [...new Map(view.plugins.flatMap(plugin => plugin.domain === undefined ? [] : [[plugin.domain.id, plugin.domain] as const])).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .reduce<{ id: string, name: string, subs: { id: string, name: string }[] }[]>((groups, domain) => {
          const id = categoryOf(domain.id)
          const group = groups.find(entry => entry.id === id) ?? groups[groups.push({ id, name: domain.category, subs: [] }) - 1]!
          group.subs.push({ id: domain.id, name: domain.sub })
          return groups
        }, [])
  return known.map((group) => {
    const subs = group.subs.map(sub => ({ id: sub.id, name: sub.name, count: counts.get(sub.id) ?? 0 }))
    return { id: group.id, name: group.name, count: subs.reduce((sum, sub) => sum + sub.count, 0), subs }
  })
}

/** The words a search looks in: the plugin's name, id, description, publisher, and its kind, domain and component as the catalog names them. */
export function searchText(plugin: PluginCatalogEntry, kinds: readonly PluginKindView[]): string {
  return [
    plugin.name, plugin.id, plugin.description, plugin.publisher, plugin.compatibility,
    kinds.find(kind => kind.slug === plugin.kind)?.name, plugin.domain?.category, plugin.domain?.sub, plugin.component?.name,
  ].filter((part): part is string => part !== undefined && part !== '').join(' ').toLowerCase()
}

export function filterPlugins(view: PluginCatalogView, filter: PluginFilter): readonly PluginCatalogEntry[] {
  const needle = filter.search.trim().toLowerCase()
  return view.plugins.filter(plugin => (filter.kind === 'all' || (filter.kind === 'unclassified' ? plugin.kind === undefined : plugin.kind === filter.kind))
    && (filter.category === undefined || (plugin.domain !== undefined && categoryOf(plugin.domain.id) === filter.category))
    && (filter.sub === undefined || plugin.domain?.id === filter.sub)
    && (filter.origin === 'all' || plugin.origin === filter.origin)
    && (needle === '' || searchText(plugin, view.kinds).includes(needle)))
}

/** The host plugin types a plugin was made for, said for a person: only `DSH stock` plugins are likely to be refused by an ACRYL app. */
export const compatibilityNote = (plugin: PluginCatalogEntry): string | undefined =>
  plugin.compatibility === 'DSH stock' ? 'Made for DeepSeek Harness. An ACRYL app may refuse it; adding it tells you why.' : undefined
