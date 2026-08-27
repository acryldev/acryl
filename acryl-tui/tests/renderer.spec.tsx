import type { Instance } from 'ink'
import { describe, expect, it } from 'vitest'
import { createAcrylRenderer } from '../src/render/app.tsx'

describe('createAcrylRenderer', () => {
  it('owns an Ink instance and unmounts it exactly once', () => {
    let unmounts = 0
    const renderer = createAcrylRenderer({
      mode: 'direct',
      ownerKind: 'tui',
      profile: 'desktop',
      generationId: 'generation-1',
      renderApp: () => ({
        unmount: () => { unmounts += 1 },
        waitUntilExit: async () => undefined,
      }) as Pick<Instance, 'unmount' | 'waitUntilExit'>,
    })

    renderer.destroy()
    renderer.destroy()

    expect(unmounts).toBe(1)
  })
})
