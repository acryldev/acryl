/**
 * Opens Settings on one of this package's sections from anywhere on the page (the "+" menu, the palette).
 *
 * The Settings panel keeps its open state inside the shell, so there is no call to open it. This uses what
 * every user does: press the Settings button, then the section in its list. It looks the button up by its
 * documented `aria-haspopup="dialog"`, and the section by its label in either shipped language. When either is
 * missing (a different shell) it does nothing and says so, and the caller tells the user where to go.
 */

import { en, zh, type SettingsSectionKey } from './locales.ts'

const MAX_FRAMES = 30

/**
 * The button that opens the Settings panel. Other buttons in the page also open dialogs (the Marketplace launcher,
 * usage panels), so this looks only in the left pane and skips anything that carries an `aria-label` or belongs to
 * the Marketplace: the Settings trigger is the one dialog button there with no label of its own.
 */
export function findSettingsTrigger(doc: Document): HTMLButtonElement | null {
  const inPane = doc.querySelectorAll<HTMLButtonElement>('[data-acryl-slot="sidebar"] button[aria-haspopup="dialog"]')
  const candidates = inPane.length > 0 ? inPane : doc.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  for (const button of candidates) {
    if (button.hasAttribute('aria-label') || button.className.includes('Market')) continue
    return button
  }
  return null
}

/** @returns true when the Settings button was found and pressed; the section is then selected as soon as it appears. */
export function openSettingsSection(
  section: SettingsSectionKey,
  doc: Document = document,
  schedule: (callback: () => void) => void = callback => { requestAnimationFrame(callback) },
): boolean {
  const labels: readonly string[] = [en[`${section}Nav`], zh[`${section}Nav`]]
  const trigger = findSettingsTrigger(doc)
  if (trigger === null) return false
  trigger.click()
  let frames = 0
  const selectSection = (): void => {
    const nav = [...doc.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')]
      .find(button => labels.includes(button.textContent?.trim() ?? ''))
    if (nav !== undefined) { nav.click(); return }
    frames += 1
    if (frames < MAX_FRAMES) schedule(selectSection)
  }
  schedule(selectSection)
  return true
}
