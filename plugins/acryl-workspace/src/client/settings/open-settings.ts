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

/** @returns true when the Settings button was found and pressed; the section is then selected as soon as it appears. */
export function openSettingsSection(
  section: SettingsSectionKey,
  doc: Document = document,
  schedule: (callback: () => void) => void = callback => { requestAnimationFrame(callback) },
): boolean {
  const labels: readonly string[] = [en[`${section}Nav`], zh[`${section}Nav`]]
  const trigger = doc.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
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
