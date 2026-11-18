/** Rules for a tab's name when the user renames it. */

export const MAX_TAB_TITLE = 40

/**
 * @param input - what was typed in the rename box.
 * @returns the name to keep, or null when nothing usable was typed (the tab then goes back to its own name).
 */
export function normalizeTabTitle(input: string): string | null {
  const collapsed = input.replace(/\s+/g, ' ').trim()
  if (collapsed === '') return null
  return [...collapsed].slice(0, MAX_TAB_TITLE).join('')
}
