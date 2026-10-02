import { describe, expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSessionNavigator } from '../../src/client/sessions/session-navigator.ts'

describe('session navigator', () => {
  it('opens a chat as the main view through the sessions service, resolved at call time', () => {
    const release = vi.fn()
    const retain = vi.fn(() => ({ release }))
    let service: ISessions | undefined
    const navigator = createSessionNavigator(() => service)
    expect(navigator.open('s1')).toBe(false)
    service = { retain } as unknown as ISessions
    expect(navigator.open('s1')).toBe(true)
    expect(retain).toHaveBeenCalledWith('s1', { source: 'mainView' })
    // A second open hands the main view over: retain the new session first, then release the old one.
    expect(navigator.open('s2')).toBe(true)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
