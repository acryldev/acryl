import { describe, expect, it } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createAcrylRenderer } from '../src/render/app.ts'

describe('createAcrylRenderer', () => {
  it('renders host identity and destroys the owned renderer', async () => {
    const setup = await createTestRenderer({ width: 60, height: 12 })
    const app = await createAcrylRenderer({
      createRenderer: async () => setup.renderer,
      mode: 'direct',
      ownerKind: 'tui',
      profile: 'desktop',
      generationId: 'generation-1',
    })

    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain('ACRYL')
    expect(frame).toContain('direct')
    expect(frame).toContain('desktop')
    expect(frame).toContain('generation-1')

    app.destroy()
    expect(setup.renderer.isDestroyed).toBe(true)
  })
})
