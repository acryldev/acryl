// @vitest-environment jsdom

/** The chat composer is focused after a reload, without ever taking focus out of the person's hands. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusChatComposer } from '../../src/client/chat/composer-focus.ts'

const composer = (): HTMLElement => {
  const element = document.createElement('div')
  element.setAttribute('contenteditable', 'true')
  element.setAttribute('aria-label', 'Describe what you want to build, / commands, @ files or sessions')
  document.body.append(element)
  return element
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('focusChatComposer', () => {
  it('focuses the composer when the page itself has focus, however late the composer arrives', () => {
    vi.useFakeTimers()
    const stop = focusChatComposer(document)
    expect(document.activeElement).toBe(document.body)
    const box = composer()
    vi.advanceTimersByTime(300)
    expect(document.activeElement).toBe(box)
    stop()
  })

  it('never takes focus from a field the person is typing in, or from a dialog that owns the page', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const box = composer()
    const stop = focusChatComposer(document)
    vi.advanceTimersByTime(600)
    expect(document.activeElement).toBe(input)
    stop()
    input.blur()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    const stopWithDialog = focusChatComposer(document)
    vi.advanceTimersByTime(600)
    expect(document.activeElement).not.toBe(box)
    stopWithDialog()
  })

  it('recovers after the surface replaces the composer, and stops watching at its deadline', () => {
    vi.useFakeTimers()
    const first = composer()
    const stop = focusChatComposer(document, 1_000, 100)
    vi.advanceTimersByTime(100)
    expect(document.activeElement).toBe(first)
    // The worktree restore re-renders the chat: the old node goes, focus falls back to the body, and a new composer mounts.
    first.remove()
    expect(document.activeElement).toBe(document.body)
    const second = composer()
    vi.advanceTimersByTime(100)
    expect(document.activeElement).toBe(second)
    // Past the deadline, a composer that mounts later is left alone.
    vi.advanceTimersByTime(2_000)
    second.remove()
    const third = composer()
    vi.advanceTimersByTime(300)
    expect(document.activeElement).not.toBe(third)
    stop()
  })
})
