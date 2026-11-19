/**
 * The launcher's screen in the Blends frame (spec 050 T016, D13): no left panel (branches and versions are about one app's history, the launcher is a list of
 * apps) and the right panel (chat, Claude Code, Codex, Pi) open. The frame has no setting for this, so the page asks the frame around it, which serves it from
 * the same origin, through the frame's own buttons: in a desktop window, in a browser tab and on the Web alike. A frame that renamed its buttons is left as it is.
 */

export const LEFT_TOGGLE = 'button[aria-label="Left panel: branches and versions"]'
export const RIGHT_TOGGLE = 'button[aria-label="Right panel: agents"]'
const STYLE_ID = 'acryl-launcher-frame-panels'

const shown = (element: Element): boolean => (element as HTMLElement).offsetParent !== null
const visibleText = (document: Document, pattern: RegExp, selector: string): boolean =>
  [...document.querySelectorAll(selector)].some(element => pattern.test(element.textContent?.trim() ?? '') && shown(element))

/** One pass: close the left panel when it is open, and open the right panel once if it is closed. Returns whether the right panel was asked to open. */
export function tidyFramePanels(frame: Document, rightAsked: boolean): boolean {
  const left = frame.querySelector<HTMLButtonElement>(LEFT_TOGGLE)
  if (left !== null && visibleText(frame, /^branches$/iu, 'div,span,h2,h3,p')) left.click()
  const right = frame.querySelector<HTMLButtonElement>(RIGHT_TOGGLE)
  if (right !== null && !rightAsked && !visibleText(frame, /History/u, 'button')) {
    right.click()
    return true
  }
  return rightAsked
}

/** Keep the frame's panels that way while the page lives: the toggle for the left panel is hidden, and every change to the frame is tidied once per frame. */
export function keepFramePanels(frame: Document): void {
  if (frame.getElementById(STYLE_ID) === null) {
    const style = frame.createElement('style')
    style.id = STYLE_ID
    style.textContent = `${LEFT_TOGGLE}{display:none!important}`
    frame.head.append(style)
  }
  let rightAsked = false
  let queued = false
  const tidy = (): void => {
    queued = false
    rightAsked = tidyFramePanels(frame, rightAsked)
  }
  tidy()
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(tidy)
  }).observe(frame.body, { childList: true, subtree: true })
}
