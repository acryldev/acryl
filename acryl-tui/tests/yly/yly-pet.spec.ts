import { describe, expect, it } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import { YlyPet } from '../../src/yly/yly-pet.js'

function fakeTui(): TUI {
  return { requestRender: () => {} } as unknown as TUI
}

describe('YlyPet', () => {
  it('renders pet frames at a normal width and hides below the threshold', () => {
    const pet = new YlyPet(fakeTui())
    const wide = pet.render(100)
    expect(wide.length).toBeGreaterThan(0)
    expect(wide[0]?.length).toBeGreaterThan(0)
    expect(pet.render(40)).toEqual([])
  })

  it('switches to a different frame by mode', () => {
    const pet = new YlyPet(fakeTui())
    const idleFrame = pet.render(80).join('\n')
    pet.setMode('streaming')
    expect(pet.render(80).join('\n')).not.toBe(idleFrame)
  })

  it('round-trips through setMode without throwing', () => {
    const pet = new YlyPet(fakeTui())
    for (const mode of ['thinking', 'tool', 'working', 'streaming', 'error', 'success'] as const) {
      pet.setMode(mode)
      expect(pet.render(80).length).toBeGreaterThan(0)
    }
  })
})
