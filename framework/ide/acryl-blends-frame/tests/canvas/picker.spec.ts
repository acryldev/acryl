// @vitest-environment jsdom

/** The picker over the app's own document: outline what the pointer is on, pick on click without letting the app act, Escape cancels. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachPicker } from '../../src/client/canvas/picker.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.cursor = ''
})

function fixture(): { task: HTMLElement; other: HTMLElement } {
  document.body.innerHTML = '<main id="board"><button>Fix the invite link</button><button>Other</button></main>'
  const buttons = document.querySelectorAll('button')
  const task = buttons[0]
  const other = buttons[1]
  if (task === undefined || other === undefined) throw new Error('the fixture rendered no buttons')
  return { task, other }
}

describe('attachPicker', () => {
  it('outlines the element under the pointer and picks the clicked one, blocking the app', () => {
    const { task } = fixture()
    const onPick = vi.fn()
    const onCancel = vi.fn()
    const remove = attachPicker(document, { onPick, onCancel })
    try {
      task.dispatchEvent(new Event('pointermove', { bubbles: true }))
      const outline = document.querySelector('[data-acryl-picker-outline]')
      expect(outline).not.toBeNull()
      expect((outline as HTMLElement).style.display).toBe('block')
      expect(outline?.textContent).toBe('"Fix the invite link"')
      expect(document.body.style.cursor).toBe('crosshair')

      let theAppActed = false
      task.addEventListener('click', () => { theAppActed = true })
      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      task.dispatchEvent(click)
      expect(theAppActed).toBe(false)
      expect(click.defaultPrevented).toBe(true)
      expect(onPick).toHaveBeenCalledTimes(1)
      const picked = onPick.mock.calls[0]?.[0] as { label: string; selector: string; page: string }
      expect(picked.label).toBe('"Fix the invite link"')
      expect(picked.selector).toBe('#board > button:nth-of-type(1)')
      expect(picked.page).toBe(document.location.pathname + document.location.search)
      expect((outline as HTMLElement).style.display).toBe('none')
    } finally {
      remove()
    }
  })

  it('hides the outline when the pointer leaves the page', () => {
    const { task } = fixture()
    const remove = attachPicker(document, { onPick: vi.fn(), onCancel: vi.fn() })
    try {
      task.dispatchEvent(new Event('pointermove', { bubbles: true }))
      const outline = document.querySelector('[data-acryl-picker-outline]') as HTMLElement
      expect(outline.style.display).toBe('block')
      document.documentElement.dispatchEvent(new Event('pointerleave'))
      expect(outline.style.display).toBe('none')
    } finally {
      remove()
    }
  })

  it('cancels on Escape', () => {
    fixture()
    const onCancel = vi.fn()
    const remove = attachPicker(document, { onPick: vi.fn(), onCancel })
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(onCancel).toHaveBeenCalledTimes(1)
    } finally {
      remove()
    }
  })

  it('takes every listener and the outline away when disposed', () => {
    const { task } = fixture()
    const onPick = vi.fn()
    const remove = attachPicker(document, { onPick, onCancel: vi.fn() })
    remove()
    expect(document.querySelector('[data-acryl-picker-outline]')).toBeNull()
    expect(document.body.style.cursor).toBe('')
    task.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    task.dispatchEvent(new Event('pointermove', { bubbles: true }))
    expect(onPick).not.toHaveBeenCalled()
    expect(document.querySelector('[data-acryl-picker-outline]')).toBeNull()
  })
})
