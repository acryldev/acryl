/**
 * Opens Settings on one of this package's sections from anywhere on the page (the "+" menu, the palette).
 *
 * The Settings panel keeps its open state inside the shell, so there is no call to open it. This uses what
 * every user does: press the Settings button, then the section in its list. It looks the button up by its
 * documented `aria-haspopup="dialog"`, and the section by its label in either shipped language. When either is
 * missing (a different shell) it does nothing and says so, and the caller tells the user where to go.
 */

import { findButtonByName } from '../dom/find-by-name.ts'
import { en, zh, type SettingsSectionKey } from './locales.ts'

/**
 * How long to keep retrying the section click once the Settings dialog is open. A frame count (the earlier
 * budget) is wrong here: right after the app starts, the section's own Settings plugin can still be PENDING on
 * `slots`/`locale` while the rest of the workspace (and this button) is already ACTIVE, so the nav row the
 * caller is waiting for may not exist yet for longer than a handful of frames. Generous and wall-clock so a
 * throttled or busy tab does not cut the retry short.
 */
const SECTION_TIMEOUT_MS = 5_000

/**
 * The button that opens the Settings panel. Other buttons in the page also open dialogs (the Marketplace launcher,
 * usage panels), so this looks only in the left pane: first the dialog button labelled "Settings" (DSH 0.2), then, for an
 * older host, the one dialog button there with no label of its own that is not the Marketplace.
 */
export function findSettingsTrigger(doc: Document): HTMLButtonElement | null {
  const inPane = doc.querySelectorAll<HTMLButtonElement>('[data-acryl-slot="sidebar"] button[aria-haspopup="dialog"]')
  const candidates = inPane.length > 0 ? inPane : doc.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  // DSH 0.2 labels its trigger "Settings" (0.1.5 left it unlabelled), so match that label first, in either shipped language.
  for (const button of candidates) {
    if (SETTINGS_TRIGGER_LABELS.includes(button.getAttribute('aria-label') ?? '')) return button
  }
  for (const button of candidates) {
    if (button.hasAttribute('aria-label') || button.className.includes('Market')) continue
    return button
  }
  return null
}

/** The accessible names DSH gives its Settings trigger. */
const SETTINGS_TRIGGER_LABELS: readonly string[] = ['Settings', '设置']

/**
 * @param onSectionSettled - called once the section step resolves: `true` once its nav button was found and
 * clicked, `false` if it never appeared within {@link SECTION_TIMEOUT_MS}. The Settings dialog is open either
 * way (its trigger was found and clicked); a caller that cares whether it actually landed on the right section
 * (rather than whatever section the shell defaulted to) uses this to tell the two apart instead of assuming
 * success.
 * @returns true when the Settings button was found and pressed; the section is then selected as soon as it
 * appears, tried again on every scheduled frame up to the timeout.
 */
export function openSettingsSection(
  section: SettingsSectionKey,
  doc: Document = document,
  schedule: (callback: () => void) => void = callback => { requestAnimationFrame(callback) },
  onSectionSettled: (found: boolean) => void = () => {},
): boolean {
  const labels: readonly string[] = [en[`${section}Nav`], zh[`${section}Nav`]]
  const trigger = findSettingsTrigger(doc)
  if (trigger === null) return false
  trigger.click()
  const deadline = Date.now() + SECTION_TIMEOUT_MS
  const selectSection = (): void => {
    const dialog = doc.querySelector('[role="dialog"] nav')
    const nav = dialog === null ? null : findButtonByName(dialog, labels)
    if (nav !== null) { nav.click(); onSectionSettled(true); return }
    if (Date.now() < deadline) schedule(selectSection)
    else onSectionSettled(false)
  }
  schedule(selectSection)
  return true
}
