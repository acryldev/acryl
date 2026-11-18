// @vitest-environment jsdom

/** The chip above the composer: what is selected, the x that clears it, and the send gestures that carry the context into the message. */

import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHIP_GAP, CHIP_INSET_PROPERTY, SelectionChip, chipGeometry, type SelectionChipInjected } from '../src/client/SelectionChip.tsx'
import { SelectionStore } from '../src/client/selection.ts'

const PICKED = { label: 'Task card', selector: '#board > div', page: '/board' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function face(store: SelectionStore): SelectionChipInjected {
  return {
    selection: {
      get: () => store.getSnapshot().selection,
      subscribe: listener => store.subscribe(listener),
    },
    clear: () => { store.clear() },
    send: vi.fn(),
    focus: vi.fn(),
  }
}

describe('chipGeometry', () => {
  it('puts the chip at the text start, centered on the first line, and moves the text past it', () => {
    expect(chipGeometry(
      { left: 100, top: 50 },
      { left: 90, top: 40 },
      { width: 80, height: 18 },
      24,
      14,
      4,
    )).toEqual({ left: 24, top: 17, textInset: 14 + 80 + CHIP_GAP })
  })
})

describe('SelectionChip', () => {
  it('renders nothing until an element is picked, then names it', () => {
    const store = new SelectionStore()
    const { container } = render(<SelectionChip {...face(store)} />)
    expect(container.querySelector('.acrylBlendsSelectionChip')).toBeNull()
    act(() => { store.select(PICKED) })
    expect(container.querySelector('.acrylBlendsSelectionChipLabel')?.textContent).toBe('Selected: Task card')
  })

  it('clears the selection from its x', () => {
    const store = new SelectionStore()
    store.select(PICKED)
    const { getByLabelText, container } = render(<SelectionChip {...face(store)} />)
    act(() => { getByLabelText('Clear selection').click() })
    expect(store.getSnapshot().selection).toBeUndefined()
    expect(container.querySelector('.acrylBlendsSelectionChip')).toBeNull()
  })

  it('gives the composer the keyboard when an element is picked', () => {
    const store = new SelectionStore()
    const injected = face(store)
    render(<SelectionChip {...injected} />)
    act(() => { store.select(PICKED) })
    expect(injected.focus).toHaveBeenCalledTimes(1)
  })

  it('carries the context on Enter and on the primary button, and leaves every other gesture alone', () => {
    const store = new SelectionStore()
    store.select(PICKED)
    const injected = face(store)
    render(<SelectionChip {...injected} />)
    document.body.insertAdjacentHTML('beforeend', `
      <div data-composer-card>
        <div contenteditable="true">Fix the invite link.</div>
        <div data-trigger-menu></div>
        <button type="button">Send</button>
      </div>`)
    const editable = document.querySelector('[contenteditable]') as HTMLElement
    const send = document.querySelector('[data-composer-card] button') as HTMLButtonElement

    // A trigger menu owns Enter: the person is picking a reference or a command.
    fireEvent.keyDown(editable, { key: 'Enter' })
    expect(injected.send).not.toHaveBeenCalled()
    document.querySelector('[data-trigger-menu]')?.remove()

    fireEvent.keyDown(editable, { key: 'Enter', shiftKey: true })
    expect(injected.send).not.toHaveBeenCalled()
    fireEvent.keyDown(editable, { key: 'Enter', isComposing: true })
    expect(injected.send).not.toHaveBeenCalled()

    fireEvent.keyDown(editable, { key: 'Enter' })
    expect(injected.send).toHaveBeenCalledTimes(1)

    // A second control after the primary means this is not the send button.
    const extra = document.createElement('button')
    extra.type = 'button'
    document.querySelector('[data-composer-card]')?.append(extra)
    fireEvent.click(send)
    expect(injected.send).toHaveBeenCalledTimes(1)
    extra.remove()

    fireEvent.click(send)
    expect(injected.send).toHaveBeenCalledTimes(2)

    // The rest of the page keeps its own gestures.
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(injected.send).toHaveBeenCalledTimes(2)
    send.disabled = true
    fireEvent.click(send)
    expect(injected.send).toHaveBeenCalledTimes(2)
  })

  it('places the chip on the composer input row and moves the draft and its placeholder past it', () => {
    const box = (left: number, top: number, width: number, height: number) => ({
      left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('acrylBlendsSelectionChip')) return box(0, 0, 80, 18) as DOMRect
      if (this.classList.contains('anchor')) return box(90, 40, 300, 0) as DOMRect
      if (this.matches('[data-composer-input]')) return box(100, 50, 300, 24) as DOMRect
      return box(0, 0, 0, 0) as DOMRect
    })
    const store = new SelectionStore()
    store.select(PICKED)
    const { container } = render(
      <div data-composer-card>
        <div className="anchor">
          <div data-slot="conversation.input.overlay">
            <SelectionChip {...face(store)} />
          </div>
        </div>
        <div data-composer-input contentEditable style={{ lineHeight: '24px', padding: '4px 8px 0 14px' }} />
        <div className="placeholder" />
      </div>,
    )
    const chip = container.querySelector('.acrylBlendsSelectionChip') as HTMLElement
    const editor = container.querySelector('[data-composer-input]') as HTMLElement
    const placeholder = container.querySelector('.placeholder') as HTMLElement
    expect(chip.style.left).toBe('24px')
    expect(chip.style.top).toBe('17px')
    // Only the first line makes room for the chip: the pad stays, the indent is the chip and its gap.
    expect(editor.style.paddingLeft).toBe('14px')
    expect(editor.style.getPropertyValue(CHIP_INSET_PROPERTY)).toBe(`${String(80 + CHIP_GAP)}px`)
    expect(placeholder.style.left).toBe(`${String(14 + 80 + CHIP_GAP)}px`)
  })

  it('stops watching gestures once the selection is gone', () => {
    const store = new SelectionStore()
    store.select(PICKED)
    const injected = face(store)
    render(<SelectionChip {...injected} />)
    document.body.insertAdjacentHTML('beforeend', '<div data-composer-card><div contenteditable="true">text</div><button>Send</button></div>')
    const editable = document.querySelector('[contenteditable]') as HTMLElement
    act(() => { store.clear() })
    fireEvent.keyDown(editable, { key: 'Enter' })
    expect(injected.send).not.toHaveBeenCalled()
  })
})
