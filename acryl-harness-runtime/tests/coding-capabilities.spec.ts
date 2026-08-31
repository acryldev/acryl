import { describe, expect, it } from 'vitest'
import {
  ACRYL_CODING_CAPABILITIES,
  createAcrylCodingCapabilityPatches,
} from '../src/coding-capabilities.ts'

describe('ACRYL_CODING_CAPABILITIES', () => {
  it('declares authorization as applicable to every product surface before each root mounts it', () => {
    expect(ACRYL_CODING_CAPABILITIES).toContainEqual(expect.objectContaining({
      id: 'authorization',
      surfaces: ['tui', 'web', 'desktop'],
    }))
  })

  it('returns fresh shared tui coding patches without implying web or desktop roots already mounted them', () => {
    const first = createAcrylCodingCapabilityPatches(new Set(['tui']))

    const insertedRows = first.flatMap(patch => ('insert' in patch && patch.insert) ? patch.insert : [])
    const insertedIds = insertedRows.map(row => row.id)
    const systemPrompt = first.find(patch => 'id' in patch && patch.id === 'system-prompt')
    const agentPresets = insertedRows.find(row => row.id === 'agent-presets')

    expect(first.map(patch => ('id' in patch ? patch.id : undefined)).filter(Boolean)).toEqual([
      'system-prompt',
    ])
    expect(systemPrompt).toEqual(expect.objectContaining({
      id: 'system-prompt',
      name: '@deepseek-ai/dsh-system-prompt',
      config: {
        persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
      },
    }))
    expect(insertedIds).toEqual([
      'agent-presets',
      'session-stats',
      'authorization',
    ])
    expect(agentPresets).toEqual(expect.objectContaining({
      id: 'agent-presets',
      name: '@deepseek-ai/dsh-agent-presets',
      config: expect.objectContaining({
        default: 'standard',
        includeShippedRoot: false,
        includeUserRoot: true,
      }),
    }))
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ insert: expect.arrayContaining([
        expect.objectContaining({ id: 'session-stats', name: '@deepseek-ai/dsh-session-stats' }),
        expect.objectContaining({ id: 'authorization', name: '@deepseek-ai/dsh-authorization' }),
      ]) }),
    ]))
    expect(JSON.stringify(first)).not.toContain('desktop-webserver')

    const [firstPatch] = first
    if (!firstPatch) throw new Error('expected at least one coding capability patch')
    firstPatch.id = 'mutated-system-prompt'

    const second = createAcrylCodingCapabilityPatches(new Set(['tui']))
    expect(second[0]?.id).toBe('system-prompt')
  })
})
