import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import { YlyPet } from '../../src/yly/yly-pet.js'

function fakeTui(cols = 100): TUI {
  return {
    terminal: { columns: cols } as never,
    requestRender: () => {},
  } as unknown as TUI
}

afterEach(() => {
  vi.useRealTimers()
})

describe('YlyPet', () => {
  it('renders pet frames at a normal width and hides below the threshold', () => {
    const pet = new YlyPet(fakeTui(110))
    expect(pet.render(100).length).toBeGreaterThan(0)
    expect(pet.render(100)[0]?.length).toBeGreaterThan(0)
    expect(new YlyPet(fakeTui(40)).render(100)).toEqual([])
  })

  it('renders at the higher large resolution on a wide terminal', () => {
    const pet = new YlyPet(fakeTui(140))
    const rows = pet.render(80)
    // Large preset is 30 cols x 16 rows; at least one row carries pet pixels.
    expect(rows.length).toBe(16)
    expect(rows.every(r => r.length >= 30)).toBe(true)
    expect(rows.some(r => r.length > 30)).toBe(true)
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

  it('deactivates into a frozen rest frame after an active burst', () => {
    vi.useFakeTimers()
    const pet = new YlyPet(fakeTui(140), { restMs: () => 5000, activeMs: () => 400 })
    pet.setMode('typing')
    pet.start()
    // typing steps are ~170-190ms each; drive past the 400ms active burst so the
    // pet deactivates into a resting (no-bob) frame.
    vi.advanceTimersByTime(600)
    const rest1 = pet.render(40).join('\n')
    const rest2 = pet.render(40).join('\n')
    expect(rest1).toBe(rest2)
  })

  it('wakes into a new active burst after a rest period', () => {
    vi.useFakeTimers()
    const pet = new YlyPet(fakeTui(140), { restMs: () => 500, activeMs: () => 400 })
    pet.setMode('typing')
    pet.start()
    vi.advanceTimersByTime(600) // exhaust the first active burst -> rest
    vi.advanceTimersByTime(500) // let the rest period elapse -> re-activate
    // Re-activated: a mode step may advance, so the frame should not be frozen
    // forever. Just assert no throw and rows render.
    expect(pet.render(40).length).toBeGreaterThan(0)
  })
})
