/** The canvas state, without a DOM: an address, an attempt, and the calls only a person or the door make. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppCanvasState } from '../../src/client/canvas/app-canvas.ts'

const ORIGIN = 'http://127.0.0.1:4444'
let canvas: AppCanvasState

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: ORIGIN } })
  canvas = new AppCanvasState()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppCanvasState', () => {
  it('takes the address the Host serves, and nothing before it', () => {
    expect(canvas.getSnapshot()).toEqual({ address: undefined, attempt: 0, loaded: undefined })
    canvas.setAddress(`${ORIGIN}/app`)
    expect(canvas.address()).toBe(`${ORIGIN}/app`)
    expect(canvas.getSnapshot().address).toBe(`${ORIGIN}/app`)
  })

  it('navigates to a path on the frame origin and reloads the same address; both ask for a new frame', () => {
    canvas.setAddress(`${ORIGIN}/app`)
    canvas.navigate('/app/settings')
    expect(canvas.address()).toBe(`${ORIGIN}/app/settings`)
    expect(canvas.attempt()).toBe(1)
    canvas.reload()
    expect(canvas.address()).toBe(`${ORIGIN}/app/settings`)
    expect(canvas.attempt()).toBe(2)
    // Navigating to the address already shown is still a reload, and still a new frame: the frame is never re-pointed.
    canvas.navigate('/app/settings')
    expect(canvas.attempt()).toBe(3)
  })

  it('does nothing on its own: no address, no reload, no load', () => {
    expect(canvas.address()).toBeUndefined()
    canvas.reload()
    expect(canvas.attempt()).toBe(0)
    expect(canvas.getSnapshot().loaded).toBeUndefined()
  })

  it('tells subscribers about an address, an attempt and a load', () => {
    const seen: number[] = []
    const stop = canvas.subscribe(() => seen.push(canvas.getSnapshot().attempt))
    canvas.setAddress(`${ORIGIN}/app`)
    canvas.reload()
    canvas.reportLoad(`${ORIGIN}/app`, true)
    expect(seen).toEqual([0, 1, 1])
    expect(canvas.getSnapshot().loaded).toEqual({ address: `${ORIGIN}/app`, readable: true })
    stop()
    canvas.reload()
    expect(seen).toEqual([0, 1, 1])
  })

  it('reads the door page window id from the frame it was handed, and nothing when the page published none', () => {
    const published = { windowId: 'window-1' }
    const view = Object.defineProperty({}, Symbol.for('acryl.door.page'), {
      value: published,
      configurable: true,
    }) as Window
    canvas.attach({ contentWindow: view } as HTMLIFrameElement)
    expect(canvas.pageWindow()).toBe('window-1')
    canvas.attach({ contentWindow: {} as Window } as HTMLIFrameElement)
    expect(canvas.pageWindow()).toBeUndefined()
    canvas.attach(null)
    expect(canvas.pageWindow()).toBeUndefined()
  })

  it('hands the live app page window to the frame view, and nothing without a page', () => {
    const view = {} as Window
    canvas.attach({ contentWindow: view } as HTMLIFrameElement)
    expect(canvas.contentWindow()).toBe(view)
    canvas.attach({ contentWindow: null } as unknown as HTMLIFrameElement)
    expect(canvas.contentWindow()).toBeUndefined()
  })
})
