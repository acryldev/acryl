/**
 * The IDE's right panel beside the launcher (spec 050 D11, T013). The frame has a `details` column for it (the `rightbar` seat of `acryl-app-shell`: tabs for
 * Files, Changes and Review, and the terminal where Claude, Codex and other agents run); the launcher screen is an overlay over the whole window, so it
 * leaves that column uncovered when it is open, and a button opens it. Both read and click the page's own elements, the way the Settings opener does.
 */

const SEAT = '[data-acryl-slot="rightbar"]'
const SHOW = 'button[aria-label="Show right panel"]'
/** Narrower than this and the column is an empty track, not a panel. */
const MIN_WIDTH = 120

/** How many pixels from the window's right edge the open right panel takes; 0 when it is closed or absent. */
export function rightPanelWidth(root: ParentNode = document, viewport: number = window.innerWidth): number {
  const seat = root.querySelector(SEAT)
  if (!(seat instanceof HTMLElement)) return 0
  const rect = seat.getBoundingClientRect()
  return rect.width < MIN_WIDTH ? 0 : Math.max(0, Math.round(viewport - rect.left))
}

/** Opens the right panel by pressing its own "Show right panel" button. @returns whether there was a button to press (it is not there when the panel is open). */
export function openRightPanel(root: ParentNode = document): boolean {
  const button = root.querySelector(SHOW)
  if (!(button instanceof HTMLButtonElement)) return false
  button.click()
  return true
}

const ASSISTANT = '[data-acryl-assistant="open"]'
/** The window event the assistant column listens for (`acryl-agent-control`'s AssistantPane); a screen needs no import to ask for it. */
export const ASSISTANT_EVENT = 'acryl:assistant'

/** How many pixels from the window's right edge the open assistant column takes; 0 when it is closed. */
export function assistantWidth(root: ParentNode = document, viewport: number = window.innerWidth): number {
  const pane = root.querySelector(ASSISTANT)
  if (!(pane instanceof HTMLElement)) return 0
  const rect = pane.getBoundingClientRect()
  return rect.width < MIN_WIDTH ? 0 : Math.max(0, Math.round(viewport - rect.left))
}

/** Opens or closes the assistant column. `cwd` is the folder its agent starts in when it has none saved yet. */
export function askAssistant(request: { readonly open: boolean, readonly cwd?: string }): void {
  window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: request }))
}
