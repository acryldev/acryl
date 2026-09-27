import { describe, expect, it } from 'vitest'
import { buildRegistryIndex, parseRegistryIndex } from '../../src/index.js'

const starter = (id: string, extra = '') => `apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata:
  id: ${id}
  name: Accounting
  version: 0.1.0
  category: business
  description: An accounting starter.
  license: MIT
  visibility: public${extra}
spec:
  runtime: cordis
  lineage:
    blueprint: acryl.blank
    blueprintVersion: 0.1.0
  rows:
    - id: brand
      name: acryl-brand
      config:
        name: Accounting
`

describe('registry index', () => {
  it('lists valid public starters, sorted, with their lineage and license', () => {
    const { index, problems } = buildRegistryIndex([
      { path: 'blends/acme.sound', manifestText: starter('acme.sound') },
      { path: 'blends/acme.accounting', manifestText: starter('acme.accounting') },
    ])
    expect(problems).toEqual([])
    expect(index.entries.map(entry => entry.id)).toEqual(['acme.accounting', 'acme.sound'])
    expect(index.entries[0]).toMatchObject({ kind: 'Blend', parent: 'acryl.blank', license: 'MIT', category: 'business', path: 'blends/acme.accounting' })
  })

  it('refuses private, unlicensed, misplaced, duplicate and invalid entries, naming each', () => {
    const { index, problems } = buildRegistryIndex([
      { path: 'blends/acme.secret', manifestText: starter('acme.secret').replace('visibility: public', 'visibility: private') },
      { path: 'blends/acme.nolicense', manifestText: starter('acme.nolicense').replace('  license: MIT\n', '') },
      { path: 'blends/elsewhere', manifestText: starter('acme.moved') },
      { path: 'blends/acme.twice', manifestText: starter('acme.twice') },
      { path: 'blends/acme.twice', manifestText: starter('acme.twice') },
      { path: 'blends/broken', manifestText: 'kind: [' },
    ])
    expect(index.entries.map(entry => entry.id)).toEqual(['acme.twice'])
    const text = problems.map(problem => problem.message).join('\n')
    for (const expected of ['marked private', 'names no license', 'must live in blends/acme.moved', 'listed twice']) expect(text).toContain(expected)
    expect(problems.some(problem => problem.path === 'blends/broken')).toBe(true)
  })

  it('an index round-trips and a malformed one is refused', () => {
    const { index } = buildRegistryIndex([{ path: 'blends/acme.accounting', manifestText: starter('acme.accounting') }])
    expect(parseRegistryIndex(JSON.stringify(index))).toEqual(index)
    expect(() => parseRegistryIndex('{"formatVersion":2,"entries":[]}')).toThrow(/not a registry index/)
    expect(() => parseRegistryIndex('{"formatVersion":1,"entries":[{"id":"x","path":"../../etc"}]}')).toThrow(/no valid path/)
  })
})
