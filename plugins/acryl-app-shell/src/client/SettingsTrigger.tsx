/**
 * DSH's Settings (`dsh-client-ui-settings-general`) is a modal drawn inside its `sidebar.settings` slot and opened by whatever fills that slot's
 * `settings.launcher`. A root whose own pane has a Settings entry (ACRYL ADE's workbench: "Settings" under the projects) still needs a launcher, or
 * the modal is never drawn and that entry has nothing to press ("Settings is not available in this window"). This one is the launcher with no look
 * of its own: a button out of sight, labelled "Settings", which the pane's entry and the desktop menu's Settings... press (acryl-workspace
 * `findSettingsTrigger`). The Blends frame fills the same seat with its gear and wins (this one is registered as the fallback).
 */

import type { PropsRuntime } from '@acryl/ui/frame'

export function SettingsTrigger({ settingsOpen, openSettings }: PropsRuntime<'settings.launcher'>) {
  return (
    <button
      type="button"
      className="dshDesktopSettingsTrigger"
      aria-label="Settings"
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      tabIndex={-1}
      onClick={openSettings}
    />
  )
}
