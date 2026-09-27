/** The two buttons in the tab strip: show or hide the terminal panel, and switch where it sits. */

import { useSyncExternalStore } from 'react'
import { ModeIcon, TerminalIcon } from './dock-icons.tsx'
import type { DockController } from './dock-controller.ts'
import { nextMode, switchLabel } from './dock-model.ts'

export interface RightPaneHandle {
  toggle(): void
  isOpen(): boolean
}

/**
 * Show or hide the terminal panel. In stacked and side-by-side modes the panel lives in the right pane, so
 * showing it also opens the right pane when it is closed. @returns nothing; the controller and the pane change.
 */
export function toggleDock(controller: DockController, rightPane: RightPaneHandle | undefined): void {
  const prefs = controller.getPrefs()
  const willOpen = !prefs.open
  controller.setOpen(willOpen)
  if (willOpen && prefs.mode !== 'bottom' && rightPane !== undefined && !rightPane.isOpen()) rightPane.toggle()
}

export function DockButtons({ controller, rightPane }: { readonly controller: DockController; readonly rightPane: RightPaneHandle | undefined }) {
  const prefs = useSyncExternalStore(controller.subscribe, controller.getPrefs)
  return (
    <div className="dshDockButtons">
      <button type="button" className="dshWorkspaceRightToggle" aria-pressed={prefs.open} aria-label={prefs.open ? 'Hide the terminal panel' : 'Show the terminal panel'} title={prefs.open ? 'Hide the terminal panel' : 'Show the terminal panel'} onClick={() => { toggleDock(controller, rightPane) }}>
        <TerminalIcon />
      </button>
      <button type="button" className="dshWorkspaceRightToggle" aria-label={switchLabel(prefs.mode)} title={switchLabel(prefs.mode)} onClick={() => { controller.cycleMode() }}>
        <ModeIcon mode={nextMode(prefs.mode)} />
      </button>
    </div>
  )
}
