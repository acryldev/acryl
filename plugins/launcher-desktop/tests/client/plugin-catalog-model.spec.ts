import { describe, expect, it } from 'vitest'
import type { PluginCatalogEntry, PluginCatalogView } from '../../src/contract.ts'
import { compatibilityNote, domainTree, filterPlugins, kindChips, unclassifiedCount } from '../../src/client/plugin-catalog-model.ts'

const plugin = (id: string, extra: Partial<PluginCatalogEntry> = {}): PluginCatalogEntry => ({ id, name: id, description: `${id} does a thing`, compatibility: 'Both', origin: 'community', publisher: 'ana', version: '1.0.0', repo: 'https://github.com/ana/x', ...extra })
const view: PluginCatalogView = {
  domains: [
    { id: '02', name: 'Application', subs: [{ id: '02-02', name: 'Personal information tools' }, { id: '02-06', name: 'Application shell components' }] },
    { id: '03', name: 'Business', subs: [{ id: '03-01', name: 'Business entity modules' }] },
    { id: '41', name: 'Gaming', subs: [{ id: '41-04', name: 'Multiplayer and live operations' }] },
  ],
  kinds: [{ slug: 'ui', name: 'UI Panels & Views', description: '' }, { slug: 'voice', name: 'Voice & Audio', description: '' }, { slug: 'fun', name: 'Fun', description: '' }],
  plugins: [
    plugin('notes', { kind: 'ui', domain: { id: '02-02', category: 'Application', sub: 'Personal information tools' }, component: { id: '02-02-02', name: 'Bookmark store' } }),
    plugin('shell', { kind: 'ui', origin: 'official', domain: { id: '02-06', category: 'Application', sub: 'Application shell components' } }),
    plugin('cards', { kind: 'fun', domain: { id: '41-04', category: 'Gaming', sub: 'Multiplayer and live operations' } }),
    plugin('mystery', { compatibility: 'DSH stock' }),
  ],
}
const all = { kind: 'all', origin: 'all', search: '' } as const

describe('kindChips', () => {
  it('shows only the kinds that hold a plugin, in the catalog order, with counts; unclassified is counted apart', () => {
    expect(kindChips(view).map(chip => [chip.kind.slug, chip.count])).toEqual([['ui', 2], ['fun', 1]])
    expect(unclassifiedCount(view)).toBe(1)
  })
})

describe('domainTree', () => {
  it('lists every domain of the shared catalog with its code, the empty ones with a count of 0, in catalog order', () => {
    expect(domainTree(view, view.plugins)).toEqual([
      { id: '02', name: 'Application', count: 2, subs: [{ id: '02-02', name: 'Personal information tools', count: 1 }, { id: '02-06', name: 'Application shell components', count: 1 }] },
      { id: '03', name: 'Business', count: 0, subs: [{ id: '03-01', name: 'Business entity modules', count: 0 }] },
      { id: '41', name: 'Gaming', count: 1, subs: [{ id: '41-04', name: 'Multiplayer and live operations', count: 1 }] },
    ])
  })

  it('counts only the plugins it is given (the kind, search and origin filters), and falls back to the domains the plugins sit in without the shared catalog', () => {
    expect(domainTree(view, view.plugins.filter(plugin => plugin.kind === 'fun')).map(group => group.count)).toEqual([0, 0, 1])
    expect(domainTree({ ...view, domains: [] }, view.plugins).map(group => [group.id, group.name, group.count])).toEqual([['02', 'Application', 2], ['41', 'Gaming', 1]])
  })
})

describe('filterPlugins', () => {
  const ids = (filter: Parameters<typeof filterPlugins>[1]) => filterPlugins(view, filter).map(entry => entry.id)

  it('filters by kind, unclassified, domain and subcategory, and by who released it', () => {
    expect(ids(all)).toEqual(['notes', 'shell', 'cards', 'mystery'])
    expect(ids({ ...all, kind: 'ui' })).toEqual(['notes', 'shell'])
    expect(ids({ ...all, kind: 'unclassified' })).toEqual(['mystery'])
    expect(ids({ ...all, category: '02' })).toEqual(['notes', 'shell'])
    expect(ids({ ...all, category: '02', sub: '02-06' })).toEqual(['shell'])
    expect(ids({ ...all, origin: 'official' })).toEqual(['shell'])
    expect(ids({ ...all, kind: 'ui', category: '41' })).toEqual([])
  })

  it('searches the name, description, publisher and the kind, domain and component names, in any case', () => {
    expect(ids({ ...all, search: ' BOOKMARK ' })).toEqual(['notes'])
    expect(ids({ ...all, search: 'ui panels' })).toEqual(['notes', 'shell'])
    expect(ids({ ...all, search: 'multiplayer' })).toEqual(['cards'])
    expect(ids({ ...all, search: 'does a thing' })).toHaveLength(4)
    expect(ids({ ...all, search: 'zzz' })).toEqual([])
  })
})

describe('compatibilityNote', () => {
  it('warns about a DeepSeek Harness plugin only', () => {
    expect(compatibilityNote(plugin('a', { compatibility: 'DSH stock' }))).toMatch(/DeepSeek Harness/u)
    expect(compatibilityNote(plugin('b', { compatibility: 'Both' }))).toBeUndefined()
  })
})
