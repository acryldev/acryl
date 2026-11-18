/**
 * The panels' resize rule (owner's T009, the mockup's grip): a panel is between 180px and 60% of the window, the app keeps at least 360px, and what a
 * window that shrank allows is decided when the frame renders, not only while a drag runs.
 */

import { describe, expect, it } from 'vitest'
import { CENTRE_MIN_WIDTH, DEFAULT_PANEL_WIDTHS, PANEL_MIN_WIDTH, clampPanelWidth, resolvePanelWidths } from '../src/client/panel-resize.ts'

describe('clampPanelWidth', () => {
  it('never lets a panel go under 180px, and never takes more than 60% of the window', () => {
    expect(clampPanelWidth(100, 1440, 0)).toBe(PANEL_MIN_WIDTH)
    expect(clampPanelWidth(1200, 1440, 0)).toBe(864)
    expect(clampPanelWidth(400, 1440, 0)).toBe(400)
  })

  it('keeps the app its 360px beside an open panel', () => {
    // 1000 - 400 - 360: the largest the dragged panel may get is 240, whatever the pointer asks for.
    expect(clampPanelWidth(500, 1000, 400)).toBe(240)
    expect(clampPanelWidth(220, 1000, 400)).toBe(220)
  })

  it('gives a closed other panel its room back', () => {
    expect(clampPanelWidth(500, 1000, 0)).toBe(500)
    expect(clampPanelWidth(500, 1000, 400)).toBe(240)
  })

  it('settles on whole pixels', () => {
    expect(clampPanelWidth(300.4, 1440, 0)).toBe(300)
    expect(clampPanelWidth(300.6, 1440, 0)).toBe(301)
  })

  it('keeps the minimum where the window cannot even hold both minimums and the app', () => {
    expect(clampPanelWidth(300, 600, 180)).toBe(PANEL_MIN_WIDTH)
  })
})

describe('resolvePanelWidths', () => {
  it('shows a closed panel at zero and keeps the stored width for the reopen', () => {
    const widths = resolvePanelWidths({ left: 320, right: 500 }, { left: false, right: true }, 1440)
    expect(widths).toEqual({ left: 0, right: 500 })
  })

  it('shows the stored widths when the window has room for them', () => {
    expect(resolvePanelWidths(DEFAULT_PANEL_WIDTHS, { left: true, right: true }, 1440)).toEqual({ left: 248, right: 412 })
  })

  it('shrinks the panels when the window shrank, so the app keeps its room', () => {
    // 800 = 180 + 260 + 360: the left takes its minimum, the right gives way to the app's room.
    const widths = resolvePanelWidths(DEFAULT_PANEL_WIDTHS, { left: true, right: true }, 800)
    expect(widths).toEqual({ left: 180, right: 260 })
    expect(widths.left + widths.right + CENTRE_MIN_WIDTH).toBe(800)
  })

  it('settles both panels at the minimum in a window too narrow for the rule, as the mockup does', () => {
    expect(resolvePanelWidths(DEFAULT_PANEL_WIDTHS, { left: true, right: true }, 600)).toEqual({ left: 180, right: 180 })
  })
})
