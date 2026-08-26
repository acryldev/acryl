import { describe, expect, it } from 'vitest'
import { formatStatusRegion } from '../src/render/status.ts'

describe('formatStatusRegion', () => {
  it('projects the host identity, selected model, and health in a stable status line', () => {
    expect(formatStatusRegion({
      mode: 'direct',
      ownerKind: 'tui',
      profile: 'desktop',
      generationId: 'generation-1',
      model: 'deepseek-v4-pro',
      health: 'healthy',
    })).toBe('mode: direct | owner: tui | profile: desktop | generation: generation-1 | model: deepseek-v4-pro | health: healthy')
  })

  it('rejects empty operator-visible identity fields', () => {
    expect(() => formatStatusRegion({
      mode: 'direct',
      ownerKind: 'tui',
      profile: '',
      generationId: 'generation-1',
      model: 'unknown',
      health: 'healthy',
    })).toThrow('profile')
  })
})
