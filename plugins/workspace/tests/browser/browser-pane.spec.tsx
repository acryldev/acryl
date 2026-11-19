// @vitest-environment jsdom

/** The browser tab's address bar is the gate to every app in the frame, so a press of Go must never be lost or do nothing. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserPane, shouldRetryBrowserLoad } from '../../src/client/browser/BrowserPane.tsx'
import { WorkspaceState, type WorkspaceTile } from '../../src/client/canvas/state.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const workspaceTile = (state: WorkspaceState, url?: string): WorkspaceTile => {
  const tile = state.addTile('browser')
  if (tile === undefined) throw new Error('the state refused a browser tile')
  if (url !== undefined) state.updateTile(tile.id, { url })
  return state.getSnapshot().tiles.find(candidate => candidate.id === tile.id) ?? tile
}

const form = (): HTMLFormElement => screen.getByLabelText('Browser address').closest('form') as HTMLFormElement

describe('BrowserPane', () => {
  it('submits the address in the field even when its change has not reached React yet', () => {
    const state = new WorkspaceState()
    const tile = workspaceTile(state)
    render(<BrowserPane tile={tile} workspace={state} />)
    // What a fast Enter after typing, a paste, or a script that fills the bar does: the field holds the address, the controlled state
    // behind it does not. Reading the React copy here (the old code) submitted nothing at all, which was the frame's first-Go failure.
    const input = screen.getByLabelText('Browser address') as HTMLInputElement
    input.value = '127.0.0.1:4000/app'
    fireEvent.submit(form())
    expect(state.getSnapshot().tiles.find(candidate => candidate.id === tile.id)?.url).toBe(
      'https://127.0.0.1:4000/app',
    )
  })

  it('reloads the same address on the next Go instead of leaving a failed page in place', () => {
    const state = new WorkspaceState()
    const tile = workspaceTile(state, 'http://127.0.0.1:4000/app')
    render(<BrowserPane tile={tile} workspace={state} />)
    const first = screen.getByTitle('Browser tab')
    fireEvent.submit(form())
    const second = screen.getByTitle('Browser tab')
    // The iframe is remounted (its key moved), so the address is really fetched again; updating the tile with the same url is a no-op
    // React never re-renders for, which is why the second and third press in the old gate could never recover from an error page.
    expect(second).not.toBe(first)
    expect(second.getAttribute('src')).toBe('http://127.0.0.1:4000/app')
    expect(state.getSnapshot().tiles.find(candidate => candidate.id === tile.id)?.url).toBe(
      'http://127.0.0.1:4000/app',
    )
  })
})

/** A load event on `frame` whose document the page cannot read: the browser's error page, or a page of another origin. */
const unreadableLoad = (frame: HTMLElement): void => {
  Object.defineProperty(frame, 'contentDocument', { configurable: true, get: () => null })
  fireEvent.load(frame)
}

const frameNow = (): HTMLElement => screen.getByTitle('Browser tab')

describe('BrowserPane never replaces a live page on its own', () => {
  it('a load from the address the frame showed before does not reload the address it shows now (the macOS agent-panel failure)', () => {
    vi.useFakeTimers()
    const state = new WorkspaceState()
    // A tab showing an outside page (the new tab's old default, or one a person typed); Go then sends it to the app's own page, which loads
    // and starts a run.
    const tile = workspaceTile(state, 'https://example.com/')
    const view = render(<BrowserPane tile={tile} workspace={state} />)
    const external = frameNow()
    act(() => { state.updateTile(tile.id, { url: 'http://localhost:3000/app/settings' }) })
    view.rerender(<BrowserPane tile={state.getSnapshot().tiles.find(candidate => candidate.id === tile.id) ?? tile} workspace={state} />)
    const app = frameNow()
    fireEvent.load(app)
    // The external page commits late, after the address changed: its document is another origin's, so it is unreadable. Re-pointing one frame
    // made that load look like the browser's error page for the app's address, and the "retry" replaced the app page 250 ms later.
    unreadableLoad(external)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(frameNow()).toBe(app)
    expect(app.getAttribute('src')).toBe('http://localhost:3000/app/settings')
    expect(external).not.toBe(app)
  })

  it('a page that navigates itself somewhere unreadable is left there, never reloaded at the tab address', () => {
    vi.useFakeTimers()
    const state = new WorkspaceState()
    const tile = workspaceTile(state, 'http://localhost:3000/app')
    render(<BrowserPane tile={tile} workspace={state} />)
    const frame = frameNow()
    fireEvent.load(frame)
    // A link to another site, followed inside the tab: the second load hides its document like an error page does, but it is the page's own move.
    unreadableLoad(frame)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(frameNow()).toBe(frame)
  })

  it("still loads the address again when the frame's first load is the browser's error page", () => {
    vi.useFakeTimers()
    const state = new WorkspaceState()
    const tile = workspaceTile(state, 'http://localhost:3000/app')
    render(<BrowserPane tile={tile} workspace={state} />)
    const failed = frameNow()
    unreadableLoad(failed)
    act(() => { vi.advanceTimersByTime(250) })
    const again = frameNow()
    expect(again).not.toBe(failed)
    expect(again.getAttribute('src')).toBe('http://localhost:3000/app')
  })

  it('a reload pending for one address never lands on the next one', () => {
    vi.useFakeTimers()
    const state = new WorkspaceState()
    const tile = workspaceTile(state, 'http://localhost:3000/app')
    const view = render(<BrowserPane tile={tile} workspace={state} />)
    unreadableLoad(frameNow())
    act(() => { state.updateTile(tile.id, { url: 'http://localhost:3000/app/settings' }) })
    view.rerender(<BrowserPane tile={state.getSnapshot().tiles.find(candidate => candidate.id === tile.id) ?? tile} workspace={state} />)
    const next = frameNow()
    fireEvent.load(next)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(frameNow()).toBe(next)
  })
})

describe('shouldRetryBrowserLoad', () => {
  const sameOrigin = 'http://127.0.0.1:4000/app'
  const retry = (options: Partial<Parameters<typeof shouldRetryBrowserLoad>[0]>): boolean =>
    shouldRetryBrowserLoad({
      src: sameOrigin,
      topOrigin: 'http://127.0.0.1:4000',
      documentReadable: false,
      retries: 0,
      firstLoad: true,
      ...options,
    })

  it('reloads an unreadable document at one of this page own addresses (the browser error page)', () => {
    expect(retry({})).toBe(true)
    expect(retry({ retries: 1 })).toBe(true)
  })

  it('leaves a readable document alone, and never retries an external page, which also hides its document', () => {
    expect(retry({ documentReadable: true })).toBe(false)
    expect(retry({ src: 'https://example.com/' })).toBe(false)
  })

  it("answers only for a frame's first load: a later unreadable load is the page navigating itself", () => {
    expect(retry({ firstLoad: false })).toBe(false)
  })

  it('stops at the attempt budget per press, and does nothing for an address it cannot parse or does not have', () => {
    expect(retry({ retries: 2 })).toBe(false)
    expect(retry({ src: 'not a url' })).toBe(false)
    expect(retry({ src: null })).toBe(false)
  })
})
