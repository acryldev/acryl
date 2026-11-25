import { describe, expect, it } from 'vitest'
import type { PluginCatalogEntry, PluginCatalogView } from '../../src/contract.ts'
import { compatibilityNote, domainTree, filterPlugins, kindChips, unclassifiedCount } from '../../src/client/plugin-catalog-model.ts'

const plugin = (id: string, extra: Partial<PluginCatalogEntry> = {}): PluginCatalogEntry => ({ id, name: id, description: `${id} does a thing`, compatibility: 'Both', origin: 'community', publisher: 'ana', version: '1.0.0', repo: 'https://github.com/ana/x', ...extra })
const view: PluginCatalogView = {
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
  it('lists only the domains that hold a plugin, in catalog order, each with its subcategories and counts', () => {
    expect(domainTree(view.plugins)).toEqual([
      { name: 'Application', count: 2, subs: [{ id: '02-02', name: 'Personal information tools', count: 1 }, { id: '02-06', name: 'Application shell components', count: 1 }] },
      { name: 'Gaming', count: 1, subs: [{ id: '41-04', name: 'Multiplayer and live operations', count: 1 }] },
    ])
  })
})

describe('filterPlugins', () => {
  const ids = (filter: Parameters<typeof filterPlugins>[1]) => filterPlugins(view, filter).map(entry => entry.id)

  it('filters by kind, unclassified, domain and subcategory, and by who released it', () => {
    expect(ids(all)).toEqual(['notes', 'shell', 'cards', 'mystery'])
    expect(ids({ ...all, kind: 'ui' })).toEqual(['notes', 'shell'])
    expect(ids({ ...all, kind: 'unclassified' })).toEqual(['mystery'])
    expect(ids({ ...all, category: 'Application' })).toEqual(['notes', 'shell'])
    expect(ids({ ...all, category: 'Application', sub: '02-06' })).toEqual(['shell'])
    expect(ids({ ...all, origin: 'official' })).toEqual(['shell'])
    expect(ids({ ...all, kind: 'ui', category: 'Gaming' })).toEqual([])
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
