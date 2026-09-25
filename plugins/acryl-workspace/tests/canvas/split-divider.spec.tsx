// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SplitDivider } from '../../src/client/canvas/SplitDivider.tsx'

afterEach(cleanup)

describe('SplitDivider', () => {
  it('is an accessible separator that moves with the arrow keys and resets on double click', () => {
    const onRatio = vi.fn()
    render(<SplitDivider stage={createRef<HTMLElement>()} ratio={0.5} onRatio={onRatio} />)
    const bar = screen.getByRole('separator', { name: 'Resize the split' })
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    fireEvent.keyDown(bar, { key: 'ArrowRight' })
    expect(onRatio).toHaveBeenLastCalledWith(0.55)
    fireEvent.keyDown(bar, { key: 'ArrowLeft' })
    expect(onRatio).toHaveBeenLastCalledWith(0.45)
    fireEvent.keyDown(bar, { key: 'a' })
    expect(onRatio).toHaveBeenCalledTimes(2)
    fireEvent.doubleClick(bar)
    expect(onRatio).toHaveBeenLastCalledWith(0.5)
  })

  it('never goes past the limits from the keyboard', () => {
    const onRatio = vi.fn()
    render(<SplitDivider stage={createRef<HTMLElement>()} ratio={0.8} onRatio={onRatio} />)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onRatio).toHaveBeenLastCalledWith(0.8)
  })
})
