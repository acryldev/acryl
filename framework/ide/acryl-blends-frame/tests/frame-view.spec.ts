// @vitest-environment jsdom

/** The frame's view handle: the app page reads the live mode, and a mode change reaches it without a reload. */

import { afterEach, describe, expect, it } from 'vitest'
import { FRAME_MODE_EVENT, FRAME_VIEW_KEY, installFrameView } from '../src/client/frame-view.ts'

const disposers: Array<() => void> = []

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
})

function view() {
  let mode: 'build' | 'preview' = 'build'
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => ({ mode }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next: 'build' | 'preview') => {
      mode = next
      for (const listener of [...listeners]) listener()
    },
  }
}

const published = (): { readonly mode: string } | undefined =>
  (window as unknown as Record<symbol, { readonly mode: string } | undefined>)[FRAME_VIEW_KEY]

describe('installFrameView', () => {
  it('publishes the live mode on the frame window and tells the app page when it changes', () => {
    const source = view()
    const app = window
    const heard: string[] = []
    const listener = (): void => { heard.push(published()?.mode ?? 'none') }
    app.addEventListener(FRAME_MODE_EVENT, listener)
    disposers.push(() => { app.removeEventListener(FRAME_MODE_EVENT, listener) })
    disposers.push(installFrameView({ contentWindow: () => app }, source))

    expect(published()?.mode).toBe('build')
    source.set('preview')
    expect(published()?.mode).toBe('preview')
    expect(heard).toEqual(['preview'])
    source.set('preview')
    expect(heard).toEqual(['preview'])
  })

  it('leaves no handle behind when it is disposed', () => {
    const source = view()
    const dispose = installFrameView({ contentWindow: () => undefined }, source)
    expect(published()).toBeDefined()
    dispose()
    expect(published()).toBeUndefined()
  })
})
