// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCell } from '../src/cell.ts'
import { useCell } from '../src/react.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(cleanup)

function Counter({ cell }: { cell: ReturnType<typeof createCell<number>> }) {
  return createElement('span', { 'data-testid': 'v' }, String(useCell(cell)))
}

describe('useCell', () => {
  it('renders the current value and re-renders when the cell changes', () => {
    const cell = createCell('r.count', 1)
    const view = render(createElement(Counter, { cell }))
    expect(view.getByTestId('v').textContent).toBe('1')
    act(() => { cell.set(2) })
    expect(view.getByTestId('v').textContent).toBe('2')
  })

  it('unsubscribes on unmount, and a second component on the same cell stays in step', () => {
    const cell = createCell('r.count', 0)
    let live = 0
    const watched = { ...cell, subscribe: (listener: Parameters<typeof cell.subscribe>[0]) => { live += 1; const stop = cell.subscribe(listener); return () => { live -= 1; stop() } } }
    const a = render(createElement(Counter, { cell: watched }))
    const b = render(createElement(Counter, { cell: watched }))
    expect(live).toBe(2)
    act(() => { cell.set(7) })
    expect(a.container.querySelector('[data-testid=v]')?.textContent).toBe('7')
    expect(b.container.querySelector('[data-testid=v]')?.textContent).toBe('7')
    a.unmount()
    expect(live).toBe(1)
    b.unmount()
    expect(live).toBe(0)
  })
})
