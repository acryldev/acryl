/** The registry reader: only Blends an ACRYL app can be made from, by name, and a reason in words when it cannot be read. */
import { describe, expect, it } from 'vitest'
import { readBlends, RegistryUnavailable } from '../src/registry.ts'

const answer = (body: unknown, status = 200) => async () => ({ ok: status < 400, status, json: async () => body })

describe('readBlends', () => {
  it('keeps the acrylblends runtime, sorts by name and fills what an entry leaves out', async () => {
    const blends = await readBlends(answer({ entries: [
      { id: 'acryl.core', name: 'Core', runtime: 'acryl' },
      { id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app', runtime: 'acrylblends' },
      { id: 'acrylblends.accounting', runtime: 'acrylblends' },
      { name: 'No id', runtime: 'acrylblends' },
    ] }))
    expect(blends).toEqual([
      { id: 'acrylblends.accounting', name: 'acrylblends.accounting', version: '', category: '', description: '' },
      { id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app' },
    ])
  })

  it('says what went wrong: no network, an HTTP error, a list that is not a list', async () => {
    await expect(readBlends(async () => { throw new TypeError('fetch failed') })).rejects.toThrow('could not be read. Check the network')
    await expect(readBlends(answer({}, 404))).rejects.toThrow('answered HTTP 404')
    await expect(readBlends(answer({ entries: 'x' }))).rejects.toBeInstanceOf(RegistryUnavailable)
  })
})
