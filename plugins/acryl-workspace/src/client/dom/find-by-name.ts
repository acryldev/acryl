/**
 * Finding a button in the page by its accessible name, the one primitive `clickAddWorkspaceTrigger` and the
 * Settings trigger lookup both need (spec 041 T040: replace ad hoc DOM-click helpers with one shared, tested
 * rule instead of each reading `aria-label` by hand). Deliberately small: `aria-label`, else the button's own
 * trimmed text — the two cases every control ACRYL's own code has ever needed to find this way. A caller that
 * needs the fuller ARIA accessible-name algorithm (labelled inputs, `aria-labelledby`, roles other than button)
 * has that in `acryl-agent-control`'s driver; this stays a workspace-local primitive so the two packages do not
 * depend on each other for one function.
 */

/** @returns the trimmed `aria-label`, or the element's own trimmed text when it has none. */
export function accessibleButtonName(button: HTMLButtonElement): string {
  const label = button.getAttribute('aria-label')?.trim()
  if (label !== undefined && label !== '') return label
  return button.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/**
 * @param root - where to search (a scoping element, or the whole document).
 * @param names - accessible names to accept, tried in order; the first match in document order for each wins.
 * @param filter - an extra check a candidate must pass (skip a button that merely shares a name), e.g. by class.
 * @returns the first matching button, or null.
 */
export function findButtonByName(
  root: ParentNode,
  names: readonly string[],
  filter: (button: HTMLButtonElement) => boolean = () => true,
): HTMLButtonElement | null {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')]
  for (const name of names) {
    const found = buttons.find(button => accessibleButtonName(button) === name && filter(button))
    if (found !== undefined) return found
  }
  return null
}

/**
 * @returns true when a button was found and clicked.
 */
export function clickButtonByName(
  root: ParentNode,
  names: readonly string[],
  filter?: (button: HTMLButtonElement) => boolean,
): boolean {
  const button = findButtonByName(root, names, filter)
  if (button === null) return false
  button.click()
  return true
}
