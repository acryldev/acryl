// @vitest-environment jsdom
/** The ring on what the agent uses: drawn in the page, on the element an act reaches, and gone a moment later. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UiDriver } from '../../src/page/driver/driver.ts'
import { mountOutlines, OUTLINE_MS } from '../../src/page/outline.ts'
import type { UiSnapshot } from '../../src/page/protocol.ts'

const RING = 'acrylDoorOutline'
const refOf = (snapshot: UiSnapshot, name: string): string => {
  const node = snapshot.nodes.find(candidate => candidate.name === name)
  if (node === undefined) throw new Error(`no "${name}" in the snapshot`)
  return node.ref
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
  document.head.replaceChildren()
})

describe('the door outline', () => {
  it('rings the element the agent clicks, and the ring goes on its own', async () => {
    document.body.innerHTML = '<a href="/my-tasks">My tasks</a><button type="button">Save</button>'
    const outlines = mountOutlines(document)
    const driver = new UiDriver({ document: () => document, sleep: async () => {}, touched: (element) => { outlines.touched(element) } })
    const snapshot = await driver.handle({ op: 'snapshot' }) as UiSnapshot
    const link = document.querySelector('a') as HTMLAnchorElement
    await driver.handle({ op: 'click', ref: refOf(snapshot, 'My tasks') })
    expect(link.classList.contains(RING)).toBe(true)
    expect(document.querySelector('button')?.classList.contains(RING)).toBe(false)
    vi.advanceTimersByTime(OUTLINE_MS - 1)
    expect(link.classList.contains(RING)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(link.classList.contains(RING)).toBe(false)
    outlines.dispose()
  })

  it('moves the ring to the next element it types into, so one run leaves one ring', async () => {
    document.body.innerHTML = '<label>Title <input type="text"></label><button type="button">Save</button>'
    const outlines = mountOutlines(document)
    const driver = new UiDriver({ document: () => document, sleep: async () => {}, touched: (element) => { outlines.touched(element) } })
    const snapshot = await driver.handle({ op: 'snapshot' }) as UiSnapshot
    await driver.handle({ op: 'click', ref: refOf(snapshot, 'Save') })
    await driver.handle({ op: 'type', ref: refOf(snapshot, 'Title'), text: 'Book the venue' })
    expect(document.querySelector('button')?.classList.contains(RING)).toBe(false)
    expect(document.querySelector('input')?.classList.contains(RING)).toBe(true)
    outlines.dispose()
  })

  it('rings nothing when an act is refused, and leaves the page as it was', async () => {
    document.body.innerHTML = '<button type="button" disabled>Save</button>'
    const outlines = mountOutlines(document)
    const driver = new UiDriver({ document: () => document, sleep: async () => {}, touched: (element) => { outlines.touched(element) } })
    const snapshot = await driver.handle({ op: 'snapshot' }) as UiSnapshot
    await expect(driver.handle({ op: 'click', ref: refOf(snapshot, 'Save') })).rejects.toMatchObject({ code: 'not-actionable' })
    expect(document.querySelectorAll(`.${RING}`)).toHaveLength(0)
    outlines.dispose()
    expect(document.getElementById('acryl-door-outline-style')).toBeNull()
  })
})
