/** The registry reader: only Blends an ACRYL app can be made from, by name, and a reason in words when it cannot be read. */
import { describe, expect, it } from 'vitest'
import { PLUGIN_CATEGORIES, PLUGIN_REGISTRY_INDEX, readBlends, readPluginCatalog, REGISTRY_DISCOVERED, REGISTRY_INDEX, REGISTRY_PLACEMENT, RegistryUnavailable } from '../src/registry.ts'

const answer = (body: unknown, status = 200) => async () => ({ ok: status < 400, status, json: async () => body })

const byUrl = (bodies: Record<string, unknown>) => async (url: string) => (url in bodies
  ? { ok: true, status: 200, json: async () => bodies[url] }
  : { ok: false, status: 404, json: async () => ({}) })

describe('readBlends', () => {
  it('adds the community Blends the registry found on GitHub, each made from its source; one without a source or with an official id is left out', async () => {
    const blends = await readBlends(byUrl({
      [REGISTRY_INDEX]: { entries: [{ id: 'acrylblends.notes', name: 'Notes', runtime: 'acrylblends', origin: 'official' }] },
      [REGISTRY_DISCOVERED]: { entries: [
        { id: 'inboxxobni.team-notes', name: 'Team Notes', runtime: 'acrylblends', origin: 'community', source: 'github:inboxxobni/team-notes#v0.1.0', category: 'notes', publisher: 'inboxxobni', placement: { category: 'Application', subcategory: 'Productivity' } },
        { id: 'ana.no-source', name: 'No source', runtime: 'acrylblends' },
        { id: 'ana.bad', name: 'Bad', runtime: 'acrylblends', source: 'https://evil.example/x.tgz' },
        { id: 'acrylblends.notes', name: 'Fake Notes', runtime: 'acrylblends', source: 'github:mallory/notes' },
      ] },
    }))
    expect(blends.map(blend => [blend.name, blend.origin, blend.source])).toEqual([
      ['Notes', 'official', undefined],
      ['Team Notes', 'community', 'github:inboxxobni/team-notes#v0.1.0'],
    ])
    // Shown where the store placed it, with its author.
    expect(blends[1]).toMatchObject({ category: 'Application › Productivity', publisher: 'inboxxobni' })
  })

  it('files each Blend where the store does, with its page and screenshot, in the store order; one the placement leaves out keeps its own word', async () => {
    const blends = await readBlends(byUrl({
      [REGISTRY_INDEX]: { entries: [
        { id: 'acryl.ade', name: 'ACRYL ADE', runtime: 'acrylblends', origin: 'official', category: 'ai' },
        { id: 'acrylblends.notes', name: 'Notes', runtime: 'acrylblends', origin: 'official', category: 'notes' },
      ] },
      [REGISTRY_PLACEMENT]: {
        formatVersion: 1,
        taxonomy: [{ name: 'System' }, { name: 'AI' }],
        entries: {
          'acryl.ade': { category: 'AI', subcategory: 'Agent Development Environment (ADE)', page: 'https://acrylblends.github.io/blends/ai/ade/acryl.ade', screenshot: 'https://acrylblends.github.io/registry/blends/acryl.ade/docs/screenshot.png' },
          'ghost.blend': { category: 'System', subcategory: 'Kernels' },
        },
      },
    }))
    expect(blends[0]).toMatchObject({
      id: 'acryl.ade',
      category: 'AI › Agent Development Environment (ADE)',
      place: { category: 'AI', subcategory: 'Agent Development Environment (ADE)', order: 1 },
      page: 'https://acrylblends.github.io/blends/ai/ade/acryl.ade',
      screenshot: 'https://acrylblends.github.io/registry/blends/acryl.ade/docs/screenshot.png',
    })
    expect(blends[1]).toMatchObject({ id: 'acrylblends.notes', category: 'notes' })
    expect(blends[1]?.place).toBeUndefined()
  })

  it('lists the Blends without categories when the placement cannot be read, and never takes a page that is not https', async () => {
    const index = { entries: [{ id: 'acryl.ade', name: 'ACRYL ADE', runtime: 'acrylblends', origin: 'official', category: 'ai' }] }
    expect((await readBlends(byUrl({ [REGISTRY_INDEX]: index })))[0]).toMatchObject({ id: 'acryl.ade', category: 'ai' })
    const odd = await readBlends(byUrl({ [REGISTRY_INDEX]: index, [REGISTRY_PLACEMENT]: { taxonomy: [], entries: { 'acryl.ade': { category: 'AI', subcategory: 'ADE', page: 'javascript:alert(1)', screenshot: 'http://x/y.png' } } } }))
    expect(odd[0]?.page).toBeUndefined()
    expect(odd[0]?.screenshot).toBeUndefined()
  })

  it('still lists the public registry when the community list cannot be read', async () => {
    const blends = await readBlends(byUrl({ [REGISTRY_INDEX]: { entries: [{ id: 'acrylblends.notes', name: 'Notes', runtime: 'acrylblends', origin: 'official' }] } }))
    expect(blends.map(blend => blend.id)).toEqual(['acrylblends.notes'])
  })

  it('keeps the acrylblends runtime, sorts by name and fills what an entry leaves out', async () => {
    const blends = await readBlends(answer({ entries: [
      { id: 'acryl.core', name: 'Core', runtime: 'acryl' },
      { id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app', runtime: 'acrylblends', origin: 'official' },
      { id: 'acrylblends.accounting', runtime: 'acrylblends' },
      { name: 'No id', runtime: 'acrylblends' },
    ] }))
    expect(blends).toEqual([
      { id: 'acrylblends.accounting', name: 'acrylblends.accounting', version: '', category: '', description: '', origin: 'community' },
      { id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app', origin: 'official' },
    ])
  })

  it('says what went wrong: no network, an HTTP error, a list that is not a list', async () => {
    await expect(readBlends(async () => { throw new TypeError('fetch failed') })).rejects.toThrow('could not be read. Check the network')
    await expect(readBlends(answer({}, 404))).rejects.toThrow('answered HTTP 404')
    await expect(readBlends(answer({ entries: 'x' }))).rejects.toBeInstanceOf(RegistryUnavailable)
  })
})

describe('readPluginCatalog', () => {
  const categories = {
    formatVersion: 2,
    kinds: [{ slug: 'ui', name: 'UI Panels & Views', description: 'Panels' }, { slug: 'fun', name: 'Fun', description: 'Just for fun.' }],
    categories: [{ id: '02', name: 'Application', subcategories: [
      { id: '02-02', name: 'Personal information tools', components: [{ id: '02-02-02', name: 'Bookmark store' }] },
      { id: '02-06', name: 'Application shell components', components: [] },
    ] }],
  }
  const quickNotes = {
    id: 'acryl-quick-notes', name: 'acryl-quick-notes', description: 'Quick notes', kind: 'ui', domain: '02-02', component: '02-02-02', compatibility: 'Both', origin: 'community',
    publisher: 'inboxxobni', version: '0.3.0', repo: 'https://github.com/inboxxobni/acryl-quick-notes', page: 'https://cordisplugins.github.io/plugins/p/acryl-quick-notes',
    acrylPull: '/plugin pull github:inboxxobni/acryl-quick-notes@0.3.0',
  }

  it('names each plugin\'s kind, domain and component from the shared catalog, with the source Pull takes, by name', async () => {
    const view = await readPluginCatalog(byUrl({
      [PLUGIN_REGISTRY_INDEX]: { entries: [{ id: 'zeta', name: 'zeta', origin: 'official', compatibility: 'ACRYL' }, quickNotes] },
      [PLUGIN_CATEGORIES]: categories,
    }))
    expect(view.kinds.map(kind => kind.slug)).toEqual(['ui', 'fun'])
    expect(view.plugins.map(plugin => plugin.id)).toEqual(['acryl-quick-notes', 'zeta'])
    expect(view.plugins[0]).toEqual({
      id: 'acryl-quick-notes', name: 'acryl-quick-notes', description: 'Quick notes', kind: 'ui', domain: { id: '02-02', category: 'Application', sub: 'Personal information tools' },
      component: { id: '02-02-02', name: 'Bookmark store' }, compatibility: 'Both', origin: 'community', publisher: 'inboxxobni', version: '0.3.0',
      repo: 'https://github.com/inboxxobni/acryl-quick-notes', page: 'https://cordisplugins.github.io/plugins/p/acryl-quick-notes', source: 'github:inboxxobni/acryl-quick-notes@0.3.0',
    })
    // No kind, domain or pull line in the entry: listed, unclassified, nothing to add.
    expect(view.plugins[1]).toMatchObject({ id: 'zeta', origin: 'official', compatibility: 'ACRYL', repo: '' })
    expect(view.plugins[1]).not.toHaveProperty('kind')
    expect(view.plugins[1]).not.toHaveProperty('source')
  })

  it('drops a kind the catalog does not know, a pull line that is not github:owner/repo@version, and entries without an id or name', async () => {
    const view = await readPluginCatalog(byUrl({
      [PLUGIN_REGISTRY_INDEX]: { entries: [
        { ...quickNotes, kind: 'nonsense', domain: '99-99', component: '99-99-99', acrylPull: '/plugin pull https://evil.example/x.tgz' },
        { name: 'no-id' },
        { id: 'no-name' },
        'junk',
      ] },
      [PLUGIN_CATEGORIES]: categories,
    }))
    expect(view.plugins).toHaveLength(1)
    expect(view.plugins[0]).not.toHaveProperty('kind')
    expect(view.plugins[0]).not.toHaveProperty('domain')
    expect(view.plugins[0]).not.toHaveProperty('component')
    expect(view.plugins[0]).not.toHaveProperty('source')
  })

  it('lists the plugins without kinds when the shared catalog cannot be read, and says so in words when the plugin list cannot', async () => {
    const view = await readPluginCatalog(byUrl({ [PLUGIN_REGISTRY_INDEX]: { entries: [quickNotes] } }))
    expect(view.kinds).toEqual([])
    expect(view.plugins[0]).not.toHaveProperty('kind')
    await expect(readPluginCatalog(byUrl({}))).rejects.toThrow(RegistryUnavailable)
    await expect(readPluginCatalog(async () => { throw new Error('offline') })).rejects.toThrow('The registry could not be read. Check the network and try again.')
  })
})
