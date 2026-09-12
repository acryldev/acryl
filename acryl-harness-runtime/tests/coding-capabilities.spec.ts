/**
 * The declaration seam between ACRYL's coding capabilities and the product
 * surfaces that compose them (spec 034). The table below is the contract: a
 * change to it is a change to what a surface boots with, so it is asserted
 * per surface rather than inferred from whichever surface happens to run.
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACRYL_CODING_CAPABILITIES,
  createAcrylCodingCapabilityPatches,
  type AcrylSurface,
} from '../src/coding-capabilities.ts'

type PatchShape = {
  readonly idRows: readonly string[]
  readonly insertedIds: readonly string[]
}

const SURFACES: readonly AcrylSurface[] = ['tui', 'web', 'desktop']

/**
 * Exact composed rows per surface, measured from the real function below.
 * `tui` is the only surface that composes ACRYL's persona, roster and
 * session-stat rows: `web`/`desktop` build on `dsh-web-app`, which already
 * composes its own. Every surface composes the authorization service.
 */
const expectedComposition: Record<AcrylSurface, PatchShape> = {
  tui: {
    idRows: ['system-prompt'],
    insertedIds: ['agent-presets', 'session-stats', 'authorization'],
  },
  web: { idRows: [], insertedIds: ['authorization'] },
  desktop: { idRows: [], insertedIds: ['authorization'] },
}

function shapeOf(patches: readonly unknown[]): PatchShape {
  const idRows: string[] = []
  const insertedIds: string[] = []
  for (const patch of patches) {
    const candidate = patch as { id?: unknown; insert?: { id?: unknown }[] }
    if (typeof candidate.id === 'string') idRows.push(candidate.id)
    for (const row of candidate.insert ?? []) {
      if (typeof row.id === 'string') insertedIds.push(row.id)
    }
  }
  return { idRows, insertedIds }
}

describe('ACRYL_CODING_CAPABILITIES declarations', () => {
  it('declares every capability for at least one surface, with unique ids and stable order', () => {
    const ids = ACRYL_CODING_CAPABILITIES.map(capability => capability.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const capability of ACRYL_CODING_CAPABILITIES) {
      expect(capability.surfaces.length).toBeGreaterThan(0)
      expect(capability.loaderPatches.length).toBeGreaterThan(0)
      for (const surface of capability.surfaces) expect(SURFACES).toContain(surface)
    }
  })

  it('declares authorization for every product surface', () => {
    const authorization = ACRYL_CODING_CAPABILITIES.find(capability => capability.id === 'authorization')
    expect(authorization?.surfaces).toEqual(['tui', 'web', 'desktop'])
    expect(JSON.stringify(authorization?.loaderPatches)).toContain('@deepseek-ai/dsh-authorization')
  })

  it('keeps the persona out of the tui-only capability set for the surfaces dsh-web-app covers', () => {
    const persona = ACRYL_CODING_CAPABILITIES.find(capability => capability.id === 'persona')
    expect(persona?.surfaces).toEqual(['tui'])
    expect(persona?.loaderPatches).toEqual([
      expect.objectContaining({
        id: 'system-prompt',
        name: '@deepseek-ai/dsh-system-prompt',
        config: {
          persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
        },
      }),
    ])
    expect(JSON.stringify(createAcrylCodingCapabilityPatches(new Set(['web'])))).not.toContain('system-prompt')
    expect(JSON.stringify(createAcrylCodingCapabilityPatches(new Set(['desktop'])))).not.toContain('system-prompt')
  })

  it('points the agent roster at a preset directory that exists beside the pinned package', () => {
    // The roster root used to be a source-checkout path
    // (`deepseek-harness/packages/preset/agent-presets/presets`), which no
    // packaged CLI ships: the row then composed with `roots: []` and
    // `includeShippedRoot: false`, i.e. a roster with no presets at all.
    const roster = ACRYL_CODING_CAPABILITIES.find(capability => capability.id === 'agent-roster')
    const inserted = roster?.loaderPatches.flatMap(patch => ('insert' in patch ? patch.insert ?? [] : [])) ?? []
    const agentPresets = inserted.find(row => row.id === 'agent-presets')
    const roots = (agentPresets?.config as { roots?: { path: string, trust: string }[] } | undefined)?.roots ?? []

    expect(roots).toHaveLength(1)
    expect(roots[0]?.trust).toBe('system')
    const root = roots[0]?.path ?? ''
    expect(root.endsWith('@deepseek-ai/dsh-agent-presets/presets')).toBe(true)
    expect(existsSync(root)).toBe(true)
    expect(existsSync(`${root}/standard/agent.cordis.yml`)).toBe(true)
  })
})

describe('createAcrylCodingCapabilityPatches', () => {
  it.each(SURFACES)('composes exactly the declared rows for %s', (surface) => {
    expect(shapeOf(createAcrylCodingCapabilityPatches(new Set([surface])))).toEqual(expectedComposition[surface])
  })

  it('composes each row only for surfaces that declare it', () => {
    for (const surface of SURFACES) {
      const patches = createAcrylCodingCapabilityPatches(new Set([surface]))
      const composedIds = Object.values(shapeOf(patches)).flat()
      const declaredForSurface = new Set(
        ACRYL_CODING_CAPABILITIES
          .filter(capability => capability.surfaces.includes(surface))
          .flatMap(capability => capability.loaderPatches.flatMap((patch) => {
            const rows = [
              ...('id' in patch && typeof patch.id === 'string' ? [patch.id] : []),
              ...('insert' in patch ? (patch.insert ?? []).map(row => row.id) : []),
            ]
            return rows
          })),
      )
      expect(new Set(composedIds)).toEqual(declaredForSurface)
    }
  })

  it('unions multiple requested surfaces without duplicating a row', () => {
    const both = shapeOf(createAcrylCodingCapabilityPatches(new Set(['web', 'desktop'])))
    expect(both.insertedIds).toEqual(['authorization'])

    const all = shapeOf(createAcrylCodingCapabilityPatches(new Set(SURFACES)))
    expect(all.idRows).toEqual(['system-prompt'])
    expect(all.insertedIds).toEqual(['agent-presets', 'session-stats', 'authorization'])
  })

  it('composes nothing for a surface set no capability declares', () => {
    expect(createAcrylCodingCapabilityPatches(new Set())).toEqual([])
  })

  it('returns fresh patches a caller may mutate without affecting the next surface', () => {
    const first = createAcrylCodingCapabilityPatches(new Set(['tui']))
    const [firstPatch] = first
    if (firstPatch === undefined) throw new Error('expected at least one coding capability patch')
    firstPatch.id = 'mutated-system-prompt'

    const second = createAcrylCodingCapabilityPatches(new Set(['tui']))
    expect(second[0]?.id).toBe('system-prompt')
    expect(JSON.stringify(ACRYL_CODING_CAPABILITIES)).not.toContain('mutated-system-prompt')
  })
})
