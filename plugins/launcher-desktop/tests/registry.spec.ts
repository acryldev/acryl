/** The registry reader: only Blends an ACRYL app can be made from, by name, and a reason in words when it cannot be read. */
import { describe, expect, it } from 'vitest'
import { readBlends, REGISTRY_DISCOVERED, REGISTRY_INDEX, RegistryUnavailable } from '../src/registry.ts'

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
