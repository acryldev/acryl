// @vitest-environment jsdom
/** The frame's own UI as the door's `frame` verb operates it: panels, mode and Settings, through the frame's view state, never the app page. */

import { afterEach, describe, expect, it } from 'vitest'
import { FRAME_CONTROL_KEY, frameControl, installFrameControl } from '../src/client/frame-control.ts'
import { OPEN_SETTINGS_EVENT } from '../src/client/SettingsLauncher.tsx'
import { FrameViewState } from '../src/client/view-state.ts'

afterEach(() => { document.body.replaceChildren() })

describe('the frame control', () => {
  it('closes, opens and toggles the panels, and reports what the person sees', async () => {
    const view = new FrameViewState(undefined)
    const control = frameControl(view)
    expect(control.state()).toEqual({ left: true, right: true, mode: 'build', settings: false })
    expect(await control.run({ action: 'close', panel: 'left' })).toMatch(/^left panel \(branches and versions\) closed/u)
    expect(view.getSnapshot().left).toBe(false)
    // Closing what is closed changes nothing.
    await control.run({ action: 'close', panel: 'left' })
    expect(view.getSnapshot().left).toBe(false)
    await control.run({ action: 'toggle', panel: 'right' })
    expect(control.state()).toEqual({ left: false, right: false, mode: 'build', settings: false })
    await control.run({ action: 'open', panel: 'left' })
    expect(control.state().left).toBe(true)
  })

  it('Preview hides both panels; opening one goes back to Build', async () => {
    const view = new FrameViewState(undefined)
    const control = frameControl(view)
    await control.run({ action: 'preview' })
    expect(control.state()).toMatchObject({ left: false, right: false, mode: 'preview' })
    await control.run({ action: 'open', panel: 'right' })
    expect(control.state()).toMatchObject({ right: true, mode: 'build' })
  })

  it('opens Settings with the launcher event and picks a section in the dialog', async () => {
    document.body.innerHTML = '<span class="acrylBlendsSettings"><button aria-label="Settings" aria-expanded="false"></button></span>'
    const gear = document.querySelector('button') as HTMLButtonElement
    let picked = ''
    window.addEventListener(OPEN_SETTINGS_EVENT, () => {
      gear.setAttribute('aria-expanded', 'true')
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.innerHTML = '<button>General</button><button>Share</button>'
      dialog.querySelectorAll('button').forEach(button => { button.addEventListener('click', () => { picked = button.textContent ?? '' }) })
      document.body.append(dialog)
    }, { once: true })
    const control = frameControl(new FrameViewState(undefined))
    expect(await control.run({ action: 'settings', section: 'share' })).toMatch(/^Settings open at Share/u)
    expect(picked).toBe('Share')
    expect(control.state().settings).toBe(true)
    await expect(control.run({ action: 'settings', section: 'Nowhere' })).rejects.toThrow('Settings has no section "Nowhere"')
  })

  it('is published on the frame window under the key the door reads, and removed on dispose', () => {
    const dispose = installFrameControl(new FrameViewState(undefined))
    expect(typeof (window as unknown as Record<symbol, { run?: unknown }>)[Symbol.for('acryl.frame.control')]?.run).toBe('function')
    expect(FRAME_CONTROL_KEY).toBe(Symbol.for('acryl.frame.control'))
    dispose()
    expect((window as unknown as Record<symbol, unknown>)[FRAME_CONTROL_KEY]).toBeUndefined()
  })
})
