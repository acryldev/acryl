/**
 * The assistant column beside the launcher (spec 050 D11, T013): `acryl-agent-control`'s AssistantPane, a Claude agent with the launcher's tools. The screen asks
 * for it with a window event (no import between the plugins) and stops where the column starts.
 */

const MIN_WIDTH = 120
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
