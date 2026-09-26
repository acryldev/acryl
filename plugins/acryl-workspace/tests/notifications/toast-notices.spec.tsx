// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toasts } from '../../src/client/notifications/Toasts.tsx'
import { describeFinish, MAX_TOASTS, TOAST_LIFETIME_MS, ToastState } from '../../src/client/notifications/toast-state.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const target = { group: '/p', tabId: 't1' }

describe('describeFinish', () => {
  it('says whether the agent finished or stopped with an error', () => {
    expect(describeFinish('Claude', 0)).toBe('Claude finished')
    expect(describeFinish('Claude', null)).toBe('Claude finished')
    expect(describeFinish('Codex', 2)).toBe('Codex stopped (exit code 2)')
  })
})

describe('ToastState', () => {
  it('keeps the newest few and lets one be dismissed', () => {
    const state = new ToastState()
    const ids = Array.from({ length: MAX_TOASTS + 2 }, (_, i) => state.push(`n${String(i)}`, target))
    expect(state.getSnapshot()).toHaveLength(MAX_TOASTS)
    expect(state.getSnapshot()[0]?.text).toBe('n2')
    state.dismiss(ids[ids.length - 1] ?? 0)
    expect(state.getSnapshot()).toHaveLength(MAX_TOASTS - 1)
    state.dismiss(9999)
    expect(state.getSnapshot()).toHaveLength(MAX_TOASTS - 1)
  })
})

describe('Toasts', () => {
  it('opens the tab a notice is about, and goes away by itself', () => {
    vi.useFakeTimers()
    const state = new ToastState()
    const onOpen = vi.fn()
    render(<Toasts state={state} onOpen={onOpen} />)
    act(() => { state.push('Claude finished', target) })
    expect(screen.getByText('Claude finished')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpen).toHaveBeenCalledWith(target)
    expect(screen.queryByText('Claude finished')).toBeNull()
    act(() => { state.push('Codex finished', target) })
    act(() => { vi.advanceTimersByTime(TOAST_LIFETIME_MS + 10) })
    expect(screen.queryByText('Codex finished')).toBeNull()
  })
})
