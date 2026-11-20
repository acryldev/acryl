/**
 * The frame's own UI, operable by the agent (the door's `frame` verb): the left panel (branches and versions), the right panel (the agents), Build and
 * Preview, and Settings. These are not part of the app page, so the door's page script, which runs in the canvas page, cannot see or click them; the
 * frame publishes this control on its own window and the page reaches it through `window.parent`, the way {@link installFrameView} publishes the mode.
 * The shapes match the door's page protocol (plugins/door/src/page/protocol.ts: `FRAME_CONTROL_KEY`, `FrameControl`); keep them in step.
 */

import { OPEN_SETTINGS_EVENT } from './SettingsLauncher.tsx'
import type { FrameMode } from './view-state.ts'

export const FRAME_CONTROL_KEY: symbol = Symbol.for('acryl.frame.control')

export type FramePanel = 'left' | 'right'

export interface FrameControlState {
  readonly left: boolean
  readonly right: boolean
  readonly mode: FrameMode
  readonly settings: boolean
}

export interface FrameControlRequest {
  readonly action: 'state' | 'open' | 'close' | 'toggle' | 'settings' | 'build' | 'preview'
  readonly panel?: FramePanel
  readonly section?: string
}

/** The part of the frame's view state the control uses (./view-state.ts). */
export interface FrameControlView {
  getSnapshot(): { readonly left: boolean; readonly right: boolean; readonly mode: FrameMode }
  toggleLeft(): void
  toggleRight(): void
  showLeft(): void
  showRight(): void
  setMode(mode: FrameMode): void
}

const PANEL_NAME: Readonly<Record<FramePanel, string>> = { left: 'left panel (branches and versions)', right: 'right panel (the agents)' }

/** What the person sees: Preview hides both panels whatever they were set to. */
function stateOf(view: FrameControlView, doc: Document): FrameControlState {
  const { left, right, mode } = view.getSnapshot()
  const gear = doc.querySelector('.acrylBlendsSettings button[aria-label="Settings"]')
  return { left: left && mode === 'build', right: right && mode === 'build', mode, settings: gear?.getAttribute('aria-expanded') === 'true' }
}

const describe = (state: FrameControlState): string =>
  `left panel ${state.left ? 'open' : 'closed'}, right panel ${state.right ? 'open' : 'closed'}, ${state.mode} mode${state.settings ? ', Settings open' : ''}`

const settle = (view: Window): Promise<void> => new Promise(resolve => { view.setTimeout(resolve, 50) })

export function frameControl(view: FrameControlView, doc: Document = document): { state(): FrameControlState; run(request: FrameControlRequest): Promise<string> } {
  const setPanel = (panel: FramePanel, open: boolean): void => {
    const shown = stateOf(view, doc)[panel]
    if (open && !shown) { if (panel === 'left') view.showLeft(); else view.showRight() }
    if (!open && shown) { if (panel === 'left') view.toggleLeft(); else view.toggleRight() }
  }
  return {
    state: () => stateOf(view, doc),
    async run(request) {
      const win = doc.defaultView ?? window
      switch (request.action) {
        case 'state': break
        case 'open': case 'close': case 'toggle': {
          const panel = request.panel
          if (panel === undefined) throw new Error(`frame ${request.action} needs left or right`)
          setPanel(panel, request.action === 'open' ? true : request.action === 'close' ? false : !stateOf(view, doc)[panel])
          await settle(win)
          return `${PANEL_NAME[panel]} ${stateOf(view, doc)[panel] ? 'open' : 'closed'}; frame: ${describe(stateOf(view, doc))}`
        }
        case 'build': case 'preview': view.setMode(request.action); break
        case 'settings': {
          if (!stateOf(view, doc).settings) win.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
          if (request.section === undefined) { await settle(win); break }
          const wanted = request.section.trim().toLowerCase()
          // The section list renders with the dialog: try for a moment.
          for (let tries = 0; tries < 20; tries += 1) {
            await settle(win)
            const button = [...doc.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(item => item.textContent?.trim().toLowerCase() === wanted)
            if (button !== undefined) { button.click(); await settle(win); return `Settings open at ${button.textContent?.trim() ?? request.section}; frame: ${describe(stateOf(view, doc))}` }
          }
          throw new Error(`Settings has no section "${request.section}"`)
        }
      }
      await settle(win)
      return `frame: ${describe(stateOf(view, doc))}`
    },
  }
}

/** Publish the control on the frame's window. @returns the disposer. */
export function installFrameControl(view: FrameControlView): () => void {
  const control = frameControl(view)
  Object.defineProperty(window, FRAME_CONTROL_KEY, { configurable: true, value: control })
  return () => {
    const own = window as unknown as Record<symbol, unknown>
    if (own[FRAME_CONTROL_KEY] === control) delete own[FRAME_CONTROL_KEY]
  }
}
