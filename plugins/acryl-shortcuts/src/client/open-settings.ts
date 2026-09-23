import type { ShortcutsRegistry } from './shortcuts-service.ts'

/** Stable id this action is registered under, for the Shortcuts settings page and this module alike. */
export const OPEN_SETTINGS_ACTION_ID = 'acryl-shortcuts.open-settings'

/**
 * Cmd+, opens Settings, matching the standard macOS app convention. The Settings dialog
 * (`@deepseek-ai/dsh-client-ui-settings-general`, pinned upstream - Constitution Principle III,
 * "compose DSH, do not fork") keeps its open/modal state as pure component-local React state with
 * no exposed service or slot hook to open it from outside, so this activates the real trigger
 * button already in the DOM rather than reaching into a private component - the same non-invasive
 * DOM approach `acryl-mount-anchors` already uses for its own overlay.
 *
 * `button[aria-haspopup="dialog"][aria-expanded]` alone is NOT enough to find it: several other
 * dialog triggers share that exact pair (the Plugin Market launcher, chat stats/usage popovers,
 * the context meter, message-feedback notes - checked directly against every real usage in
 * `deepseek-harness/packages`), and a plain `querySelector` returns whichever happens to be first
 * in DOM order - found exactly this way, when the shortcut opened Plugin Market instead of
 * Settings. Every one of those OTHER triggers carries its own `aria-label`; the Settings trigger
 * is the one candidate that does not (its accessible name comes from slot-registered text content
 * instead, `ui-settings-general/src/client/chrome.tsx`'s `TriggerContent`), so excluding
 * `[aria-label]` disambiguates it without depending on hashed CSS Module class names.
 */
export function registerOpenSettingsShortcut(shortcuts: ShortcutsRegistry): () => void {
  shortcuts.register({
    id: OPEN_SETTINGS_ACTION_ID,
    label: 'Open Settings',
    defaultCombo: 'cmd+,',
  })
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!shortcuts.matches(OPEN_SETTINGS_ACTION_ID, event)) return
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"][aria-expanded]:not([aria-label])',
    )
    if (trigger === null) return
    event.preventDefault()
    trigger.click()
  }
  window.addEventListener('keydown', onKeyDown)
  return () => { window.removeEventListener('keydown', onKeyDown) }
}
