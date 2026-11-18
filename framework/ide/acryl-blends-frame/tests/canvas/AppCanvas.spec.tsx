// @vitest-environment jsdom

/** The centre renders a frame per address and per attempt: a navigation mounts a NEW frame, so a late load from an earlier address can never land on
 * the current one (docs/plans/ide-host-inversion.md section 30, the browser-tile cause). */

import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppCanvasState } from '../../src/client/canvas/app-canvas.ts'
import { AppCanvas, appPage } from '../../src/client/canvas/AppCanvas.tsx'

afterEach(() => {
  cleanup()
})

const frame = (container: HTMLElement): HTMLIFrameElement => {
  const found = container.querySelector('iframe')
  if (found === null) throw new Error('the canvas rendered no frame')
  return found as HTMLIFrameElement
}

describe('AppCanvas', () => {
  it('renders nothing until the Host serves an app', () => {
    const canvas = new AppCanvasState()
    const { container } = render(<AppCanvas canvas={canvas} />)
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('renders the app page in one frame that is never re-pointed', () => {
    const canvas = new AppCanvasState()
    canvas.setAddress(`${window.location.origin}/app`)
    const { container } = render(<AppCanvas canvas={canvas} />)
    const first = frame(container)
    expect(first.getAttribute('src')).toBe(`${window.location.origin}/app`)
    // A navigation mounts a new frame with the new address; the old element is gone, never re-pointed.
    act(() => { canvas.navigate('/app/settings') })
    const second = frame(container)
    expect(second).not.toBe(first)
    expect(second.getAttribute('src')).toBe(`${window.location.origin}/app/settings`)
    expect(first.getAttribute('src')).toBe(`${window.location.origin}/app`)
    // A reload mounts a new frame at the same address.
    act(() => { canvas.reload() })
    const third = frame(container)
    expect(third).not.toBe(second)
    expect(third.getAttribute('src')).toBe(`${window.location.origin}/app/settings`)
  })

  it('hands its live frame to the service for the door page window id', () => {
    const canvas = new AppCanvasState()
    canvas.setAddress(`${window.location.origin}/app`)
    render(<AppCanvas canvas={canvas} />)
    // jsdom does not run the door script; the page publishes the key itself on its window, and the service reads the frame the component rendered.
    const view = frame(document.body).contentWindow as Window
    Object.defineProperty(view, Symbol.for('acryl.door.page'), {
      value: { windowId: 'window-1' },
      configurable: true,
    })
    expect(canvas.pageWindow()).toBe('window-1')
  })

  it('picks from the app document while the select control is on', () => {
    const canvas = new AppCanvasState()
    canvas.setAddress(`${window.location.origin}/app`)
    const onPick = vi.fn()
    const { container } = render(<AppCanvas canvas={canvas} picking onPick={onPick} />)
    const iframe = frame(container)
    const app = appDocument(iframe)
    const card = app.createElement('div')
    card.textContent = 'Fix the invite link'
    app.body.append(card)
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]?.[0]).toEqual({
      label: '"Fix the invite link"',
      selector: 'body > div',
      page: app.location.pathname + app.location.search,
    })
  })

  it('knows the page a loaded app document shows, and nothing before it loads', () => {
    expect(appPage({ location: { href: 'about:blank', pathname: 'blank', search: '' } })).toBeUndefined()
    expect(appPage({ location: { href: '', pathname: '', search: '' } })).toBeUndefined()
    expect(appPage({ location: { href: 'http://127.0.0.1:3730/app/about?tab=1', pathname: '/app/about', search: '?tab=1' } })).toBe('/app/about?tab=1')
  })

  it('leaves the app alone when the select control is off', () => {
    const canvas = new AppCanvasState()
    canvas.setAddress(`${window.location.origin}/app`)
    const onPick = vi.fn()
    const { container } = render(<AppCanvas canvas={canvas} onPick={onPick} />)
    const app = appDocument(frame(container))
    const card = app.createElement('div')
    card.textContent = 'Fix the invite link'
    app.body.append(card)
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).not.toHaveBeenCalled()
  })
})

/** jsdom leaves a frame document empty until it is written; the load report then re-attaches the picker to the page that exists. */
function appDocument(iframe: HTMLIFrameElement): Document {
  const app = iframe.contentDocument
  if (app === null) throw new Error('the canvas frame has no document')
  app.open()
  app.write('<!doctype html><html><body></body></html>')
  app.close()
  act(() => { iframe.dispatchEvent(new Event('load')) })
  return app
}
