import { describe, expect, it } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import { YlyPet } from '../../src/yly/yly-pet.js'

function fakeTui(cols = 100): TUI {
  return {
    terminal: { columns: cols } as never,
    requestRender: () => {},
  } as unknown as TUI
}

describe('YlyPet', () => {
  it('renders pet frames at a normal width and hides below the threshold', () => {
    const pet = new YlyPet(fakeTui(110))
    expect(pet.render(100).length).toBeGreaterThan(0)
    expect(pet.render(100)[0]?.length).toBeGreaterThan(0)
    expect(new YlyPet(fakeTui(40)).render(100)).toEqual([])
  })

  it('switches to a different frame by mode', () => {
    const pet = new YlyPet(fakeTui())
    const idleFrame = pet.render(80).join('\n')
    pet.setMode('typing')
    expect(pet.render(80).join('\n')).not.toBe(idleFrame)
  })

  it('round-trips through setMode without throwing', () => {
    const pet = new YlyPet(fakeTui())
    for (const mode of ['thinking', 'walking', 'tool', 'typing', 'error', 'success'] as const) {
      pet.setMode(mode)
      expect(pet.render(80).length).toBeGreaterThan(0)
    }
  })
})
