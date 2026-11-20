// @vitest-environment jsdom
/** The door operates the ACRYL frame around a canvas page through the control the frame publishes, and `look` reports the frame. */

import { afterEach, describe, expect, it } from 'vitest'
import { UiDriver } from '../../src/page/driver/driver.ts'
import { parseUiRequest, UiControlError, type FrameControl, type FrameState, type UiSnapshot } from '../../src/page/protocol.ts'
import { renderSnapshot } from '../../src/page/snapshot-text.ts'

afterEach(() => { document.body.replaceChildren() })

function fakeFrame(): { control: FrameControl; seen: string[] } {
  let state: FrameState = { left: true, right: true, mode: 'build', settings: false }
  const seen: string[] = []
  return {
    seen,
    control: {
      state: () => state,
      run: (request) => {
        seen.push([request.action, request.panel, request.section].filter(Boolean).join(' '))
        if (request.panel === 'left') state = { ...state, left: request.action === 'open' }
        return `left panel ${state.left ? 'open' : 'closed'}`
      },
    },
  }
}

describe('the frame op', () => {
  it('parses only well-formed frame calls', () => {
    expect(parseUiRequest({ op: 'frame' })).toEqual({ op: 'frame', action: 'state' })
    expect(parseUiRequest({ op: 'frame', action: 'close', panel: 'left' })).toEqual({ op: 'frame', action: 'close', panel: 'left' })
    expect(parseUiRequest({ op: 'frame', action: 'settings', section: 'Share' })).toEqual({ op: 'frame', action: 'settings', section: 'Share' })
    expect(() => parseUiRequest({ op: 'frame', action: 'close' })).toThrow('needs a panel')
    expect(() => parseUiRequest({ op: 'frame', action: 'close', panel: 'top' })).toThrow('left or right')
    expect(() => parseUiRequest({ op: 'frame', action: 'explode' })).toThrow('frame action')
    expect(() => parseUiRequest({ op: 'frame', action: 'open', panel: 'left', section: 'App' })).toThrow('section goes with settings')
  })

  it('closes the frame panel through the control and look shows the frame, without touching the page', async () => {
    document.body.innerHTML = '<button type="button">Collapse dataset</button>'
    const { control, seen } = fakeFrame()
    const driver = new UiDriver({ document: () => document, sleep: async () => {}, frame: () => control })
    expect(await driver.handle({ op: 'frame', action: 'close', panel: 'left' })).toEqual({ ok: true, detail: 'left panel closed' })
    expect(seen).toEqual(['close left'])
    const snapshot = await driver.handle({ op: 'snapshot' }) as UiSnapshot
    expect(snapshot.frame).toEqual({ left: false, right: true, mode: 'build', settings: false })
    const text = renderSnapshot(snapshot)
    expect(text.split('\n')[0]).toMatch(/^Frame \(the ACRYL window around the app, not part of the app\): left panel \(branches, versions\) closed, right panel \(agents\) open, build mode\./u)
    expect(text).toContain('button "Collapse dataset"')
  })

  it('a page on its own has no frame: look says nothing of one and frame is refused', async () => {
    const driver = new UiDriver({ document: () => document, sleep: async () => {} })
    expect((await driver.handle({ op: 'snapshot' }) as UiSnapshot).frame).toBeUndefined()
    await expect(driver.handle({ op: 'frame', action: 'state' })).rejects.toThrow(UiControlError)
    await expect(driver.handle({ op: 'frame', action: 'state' })).rejects.toThrow('not inside the ACRYL frame')
  })
})
