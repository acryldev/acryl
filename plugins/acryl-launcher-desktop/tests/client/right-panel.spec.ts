// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openRightPanel, rightPanelWidth } from '../../src/client/right-panel.ts'

afterEach(() => { document.body.innerHTML = '' })

const seat = (left: number, width: number): HTMLElement => {
  const element = document.createElement('aside')
  element.setAttribute('data-acryl-slot', 'rightbar')
  element.getBoundingClientRect = () => ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) })
  document.body.appendChild(element)
  return element
}

describe('rightPanelWidth', () => {
  it('is how far the open right panel reaches from the window\'s right edge, and 0 when it is closed, empty or missing', () => {
    expect(rightPanelWidth(document, 1400)).toBe(0)
    seat(900, 500)
    expect(rightPanelWidth(document, 1400)).toBe(500)
    document.body.innerHTML = ''
    seat(1400, 0)
    expect(rightPanelWidth(document, 1400)).toBe(0)
  })
})

describe('openRightPanel', () => {
  it('presses the page\'s own Show right panel button, and says so when there is none (the panel is already open)', () => {
    expect(openRightPanel()).toBe(false)
    const button = document.createElement('button')
    button.setAttribute('aria-label', 'Show right panel')
    const pressed = vi.fn()
    button.addEventListener('click', pressed)
    document.body.appendChild(button)
    expect(openRightPanel()).toBe(true)
    expect(pressed).toHaveBeenCalledTimes(1)
  })
})
