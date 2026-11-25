/** What the plugin catalog shows, worked out from the Host's list (spec 053 E): pure functions, no DOM, like `model.ts`. */
import type { PluginCatalogEntry, PluginCatalogView, PluginKindView } from '../contract.ts'

export type KindFilter = 'all' | 'unclassified' | string
export type OriginFilter = 'all' | PluginCatalogEntry['origin']

export interface PluginFilter {
  readonly kind: KindFilter
  /** A domain category (`Application`) and, within it, one subcategory's id (`02-06`); both absent: every domain. */
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
export interface DomainGroup { readonly name: string, readonly count: number, readonly subs: readonly DomainSub[] }

/** The domains that hold at least one of `plugins`, in the shared catalog's order (by id), each with its subcategories and counts. */
export function domainTree(plugins: readonly PluginCatalogEntry[]): readonly DomainGroup[] {
  const byCategory = new Map<string, { first: string, count: number, subs: Map<string, { name: string, count: number }> }>()
  for (const plugin of plugins) {
    if (plugin.domain === undefined) continue
    const group = byCategory.get(plugin.domain.category) ?? { first: plugin.domain.id, count: 0, subs: new Map() }
    group.count += 1
    if (plugin.domain.id < group.first) group.first = plugin.domain.id
    const sub = group.subs.get(plugin.domain.id) ?? { name: plugin.domain.sub, count: 0 }
    sub.count += 1
    group.subs.set(plugin.domain.id, sub)
    byCategory.set(plugin.domain.category, group)
  }
  return [...byCategory].sort(([, a], [, b]) => a.first.localeCompare(b.first)).map(([name, group]) => ({
    name,
    count: group.count,
    subs: [...group.subs].sort(([a], [b]) => a.localeCompare(b)).map(([id, sub]) => ({ id, name: sub.name, count: sub.count })),
  }))
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
    && (filter.category === undefined || plugin.domain?.category === filter.category)
    && (filter.sub === undefined || plugin.domain?.id === filter.sub)
    && (filter.origin === 'all' || plugin.origin === filter.origin)
    && (needle === '' || searchText(plugin, view.kinds).includes(needle)))
}

/** The host plugin types a plugin was made for, said for a person: only `DSH stock` plugins are likely to be refused by an ACRYL app. */
export const compatibilityNote = (plugin: PluginCatalogEntry): string | undefined =>
  plugin.compatibility === 'DSH stock' ? 'Made for DeepSeek Harness. An ACRYL app may refuse it; adding it tells you why.' : undefined
