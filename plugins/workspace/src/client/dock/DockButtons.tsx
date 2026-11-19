/** The tab strip's layout buttons: where the (always-visible) terminal panel sits, and the right panel's own open/closed state. */

import { useSyncExternalStore } from 'react'
import { ModeIcon, RightPanelIcon } from './dock-icons.tsx'
import type { DockController } from './dock-controller.ts'
import { nextMode, switchLabel } from './dock-model.ts'

/** The whole right pane's own open/collapsed state - a separate, still-useful concept from the dock's mode: it
 * gives the centre column more room regardless of which mode the (always-visible) terminal panel is in. */
export interface RightPaneHandle {
  toggle(): void
  isOpen(): boolean
  subscribe(listener: () => void): () => void
}

const NEVER_CHANGES = (): (() => void) => () => {}
const CLOSED = (): boolean => false

/**
 * The terminal panel is always visible, but in `stacked` and `side` modes it lives inside the right pane, so
 * moving there needs that pane open too - one rule, used by both ways a person changes the mode (this button,
 * the palette's `Terminal panel: ...` commands), so they cannot drift into disagreeing about it.
 */
export function ensureDockVisible(dock: DockController, rightPane: RightPaneHandle | undefined): void {
  if (dock.getPrefs().mode !== 'bottom' && rightPane !== undefined && !rightPane.isOpen()) rightPane.toggle()
}

export function DockButtons({ controller, rightPane }: { readonly controller: DockController; readonly rightPane: RightPaneHandle | undefined }) {
  const prefs = useSyncExternalStore(controller.subscribe, controller.getPrefs)
  // While the right panel is closed, nothing else on screen opens it (its own collapse button goes with it, and the terminal may sit at the
  // bottom), so this shows then and only then; its glyph is filled so it does not read as the mode button's 'side' layout.
  const open = useSyncExternalStore(rightPane?.subscribe ?? NEVER_CHANGES, rightPane?.isOpen ?? CLOSED)
  return (
    <div className="dshDockButtons">
      <button
        type="button"
        className="dshWorkspaceRightToggle"
        aria-label={switchLabel(prefs.mode)}
        title={switchLabel(prefs.mode)}
        onClick={() => { controller.cycleMode(); ensureDockVisible(controller, rightPane) }}
      >
        <ModeIcon mode={nextMode(prefs.mode)} />
      </button>
      {rightPane !== undefined && !open && (
        <button
          type="button"
          className="dshWorkspaceRightToggle"
          aria-label="Show right panel"
          title="Show right panel (Files, Changes, Review)"
          onClick={() => { rightPane.toggle() }}
        >
          <RightPanelIcon />
        </button>
      )}
    </div>
  )
}
