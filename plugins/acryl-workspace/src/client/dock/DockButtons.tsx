/** The one button in the tab strip that switches where the (always-visible) terminal panel sits. */

import { useSyncExternalStore } from 'react'
import { ModeIcon } from './dock-icons.tsx'
import type { DockController } from './dock-controller.ts'
import { nextMode, switchLabel } from './dock-model.ts'

/** The whole right pane's own open/collapsed state - a separate, still-useful concept from the dock's mode: it
 * gives the centre column more room regardless of which mode the (always-visible) terminal panel is in. */
export interface RightPaneHandle {
  toggle(): void
  isOpen(): boolean
}

export function DockButtons({ controller }: { readonly controller: DockController }) {
  const prefs = useSyncExternalStore(controller.subscribe, controller.getPrefs)
  return (
    <div className="dshDockButtons">
      <button type="button" className="dshWorkspaceRightToggle" aria-label={switchLabel(prefs.mode)} title={switchLabel(prefs.mode)} onClick={() => { controller.cycleMode() }}>
        <ModeIcon mode={nextMode(prefs.mode)} />
      </button>
    </div>
  )
}
