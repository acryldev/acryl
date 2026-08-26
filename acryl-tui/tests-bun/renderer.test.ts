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
    expect(frame).toContain('Message ACRYL')

    app.destroy()
    expect(setup.renderer.isDestroyed).toBe(true)
  })

  it('accepts a focused composer message and reports an unavailable Harness runtime on submit', async () => {
    const setup = await createTestRenderer({ width: 80, height: 12 })
    const app = await createAcrylRenderer({
      createRenderer: async () => setup.renderer,
      mode: 'direct',
      ownerKind: 'tui',
      profile: 'desktop',
      generationId: 'generation-1',
    })

    await setup.mockInput.typeText('Hello ACRYL')
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('Hello ACRYL')

    setup.mockInput.pressEnter()
    await setup.flush()
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('Message not sent: Harness session runtime is not connected.')

    app.destroy()
  })
})
