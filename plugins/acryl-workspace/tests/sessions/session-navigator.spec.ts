import { describe, expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSessionNavigator } from '../../src/client/sessions/session-navigator.ts'

describe('session navigator', () => {
  it('opens a chat through the sessions service, resolved at call time', () => {
    const open = vi.fn()
    let service: ISessions | undefined
    const navigator = createSessionNavigator(() => service)
    expect(navigator.open('s1')).toBe(false)
    service = { open } as unknown as ISessions
    expect(navigator.open('s1')).toBe(true)
    expect(open).toHaveBeenCalledWith('s1')
  })
})
