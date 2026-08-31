import { describe, expect, it } from 'vitest'
import {
  ACRYL_CODING_CAPABILITIES,
  createAcrylCodingCapabilityPatches,
} from '../src/coding-capabilities.ts'

describe('ACRYL_CODING_CAPABILITIES', () => {
  it('declares authorization for every applicable surface', () => {
    expect(ACRYL_CODING_CAPABILITIES).toContainEqual(expect.objectContaining({
      id: 'authorization',
      surfaces: ['tui', 'web', 'desktop'],
    }))
  })

  it('returns fresh shared coding patches without desktop rows', () => {
    const first = createAcrylCodingCapabilityPatches(new Set(['tui']))

    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'system-prompt' }),
      expect.objectContaining({ insert: expect.arrayContaining([
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
