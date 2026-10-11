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

  it('opens through DSH\'s own navigation when it is composed, so DSH releases the session it held and nothing keeps the old chat on screen', () => {
    const release = vi.fn()
    const retain = vi.fn(() => ({ release }))
    const service = { retain } as unknown as ISessions
    const openSession = vi.fn()
    let navigation: { openSession: (id: never) => void } | undefined
    const navigator = createSessionNavigator(() => service, () => navigation)
    // Before the navigation exists, ACRYL holds the main view itself.
    expect(navigator.open('s1')).toBe(true)
    expect(retain).toHaveBeenCalledTimes(1)
    navigation = { openSession }
    expect(navigator.open('s2')).toBe(true)
    expect(openSession).toHaveBeenCalledWith('s2')
    expect(retain).toHaveBeenCalledTimes(1)
    // The hold ACRYL took before is released, so it cannot pin s1.
    expect(release).toHaveBeenCalledTimes(1)
    expect(navigator.open('s3')).toBe(true)
    expect(openSession).toHaveBeenLastCalledWith('s3')
    expect(release).toHaveBeenCalledTimes(1)
  })
})
