import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCtrlCHandler } from '../../src/tui/ctrl-c-handler.js'

function stubOptions(overrides: { isRunning?: boolean; quitWindowMs?: number } = {}) {
  const cancel = vi.fn()
  const quit = vi.fn()
  const setNotice = vi.fn()
  const handler = createCtrlCHandler({
    isRunning: () => overrides.isRunning ?? false,
    cancel,
    quit,
    setNotice,
    quitWindowMs: overrides.quitWindowMs,
  })
  return { handler, cancel, quit, setNotice }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCtrlCHandler', () => {
  it('cancels the running turn on a bare press, without arming the quit warning', () => {
    const { handler, cancel, quit, setNotice } = stubOptions({ isRunning: true })
    expect(handler.press()).toBe('cancelled')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(quit).not.toHaveBeenCalled()
    expect(setNotice).not.toHaveBeenCalled()
  })

  it('does not quit on a second press while a turn is still running - each press only cancels', () => {
    const { handler, cancel, quit } = stubOptions({ isRunning: true })
    expect(handler.press()).toBe('cancelled')
    expect(handler.press()).toBe('cancelled')
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(quit).not.toHaveBeenCalled()
  })

  it('arms the quit warning on a bare press when idle', () => {
    const { handler, cancel, quit, setNotice } = stubOptions({ isRunning: false })
    expect(handler.press()).toBe('armed')
    expect(cancel).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
    expect(setNotice).toHaveBeenCalledWith('Press Ctrl+C again and Acryl will quit this session')
  })

  it('quits on a second press within the window', () => {
    const { handler, quit } = stubOptions({ isRunning: false })
    handler.press()
    expect(handler.press()).toBe('quit')
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('treats a press after the window expires as fresh, arming again rather than quitting', () => {
    const { handler, quit, setNotice } = stubOptions({ isRunning: false, quitWindowMs: 2000 })
    handler.press()
    vi.advanceTimersByTime(2001)
    expect(handler.press()).toBe('armed')
    expect(quit).not.toHaveBeenCalled()
    expect(setNotice).toHaveBeenCalledTimes(2)
  })

  it('a press exactly at the window boundary still counts as expired (setTimeout already fired)', () => {
    const { handler, quit } = stubOptions({ isRunning: false, quitWindowMs: 2000 })
    handler.press()
    vi.advanceTimersByTime(2000)
    expect(handler.press()).toBe('armed')
    expect(quit).not.toHaveBeenCalled()
  })

  it('disarm() clears an active warning early, so the next press arms fresh instead of quitting', () => {
    const { handler, quit } = stubOptions({ isRunning: false })
    handler.press()
    handler.disarm()
    expect(handler.press()).toBe('armed')
    expect(quit).not.toHaveBeenCalled()
  })

  it('disarm() on an unarmed handler is a harmless no-op', () => {
    const { handler } = stubOptions()
    expect(() => handler.disarm()).not.toThrow()
  })

  it('a turn starting to run between an armed warning and the next press still quits - the second press always confirms', () => {
    let running = false
    const cancel = vi.fn()
    const quit = vi.fn()
    const setNotice = vi.fn()
    const handler = createCtrlCHandler({ isRunning: () => running, cancel, quit, setNotice })
    expect(handler.press()).toBe('armed')
    running = true
    expect(handler.press()).toBe('quit')
    expect(quit).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
  })
})
