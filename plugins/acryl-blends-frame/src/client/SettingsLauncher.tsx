/**
 * The top bar's gear. DSH's Settings (`dsh-client-ui-settings-general`) is a modal that renders inside its own `sidebar.settings` slot, opened by
 * whatever fills that slot's `settings.launcher`; the frame renders the slot in its top bar and fills the launcher with this gear, so the gear opens
 * DSH's real Settings and nothing else. The Desktop's Settings... menu item reaches the same launcher through a window event.
 */

import type { PropsRuntime } from '@acryl/ui/frame'
import { useEffect } from 'react'

/** The window event the Desktop's Settings... menu item sends (`plugins/desktop/frame.ts`, `openFrameSettings`); keep the string in step. */
export const OPEN_SETTINGS_EVENT = 'acryl:open-settings'

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export function SettingsLauncher({ settingsOpen, openSettings, settingsShortcut }: PropsRuntime<'settings.launcher'>) {
  useEffect(() => {
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    return () => { window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings) }
  }, [openSettings])
  return (
    <button
      type="button"
      className="acrylBlendsIconButton"
      aria-label="Settings"
      title="Settings"
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      aria-keyshortcuts={settingsShortcut?.aria}
      onClick={openSettings}
    >
      <GearIcon />
    </button>
  )
}
