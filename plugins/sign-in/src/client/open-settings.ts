/**
 * Opens Settings on its Models section from the first-run step: press the Settings button, then the section in its list, as a person does. The Settings
 * panel keeps its open state inside the shell, so there is no call to open it. `acryl-workspace` has the same helper for its own sections; this one
 * is the narrow copy this package needs (the plugins do not import each other's client code).
 */

/** The accessible names DSH gives its Settings trigger, and the Models section's nav label, in both shipped languages. */
const SETTINGS_LABELS: readonly string[] = ['Settings', '设置']
const MODELS_LABELS: readonly string[] = ['Models', '模型']
const SECTION_TIMEOUT_MS = 5_000

const byName = (root: ParentNode, labels: readonly string[]): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => labels.includes((button.getAttribute('aria-label') ?? button.textContent ?? '').trim()))

/** @returns whether the Settings button was found and pressed; the Models section is selected as soon as it appears. */
export function openModelsSettings(doc: Document = document, schedule: (callback: () => void) => void = callback => { requestAnimationFrame(callback) }): boolean {
  // Other panes may have a button with the same name (the ACRYL screen's own nav has a "Settings" entry); the trigger is the one that opens a dialog.
  const trigger = [...doc.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find(button => SETTINGS_LABELS.includes((button.getAttribute('aria-label') ?? button.textContent ?? '').trim()))
  if (trigger === undefined) return false
  trigger.click()
  const deadline = Date.now() + SECTION_TIMEOUT_MS
  const select = (): void => {
    // Every dialog's nav is searched: the ACRYL screen is a dialog too and its nav comes first in the page.
    const nav = [...doc.querySelectorAll('[role="dialog"] nav')].map(dialog => byName(dialog, MODELS_LABELS)).find(button => button !== undefined)
    if (nav !== undefined) nav.click()
    else if (Date.now() < deadline) schedule(select)
  }
  schedule(select)
  return true
}
