/**
 * A green ring on the element the agent just used, for a moment (docs/design/blends-frame-mockup.html outlines the "My tasks" the assistant opened). It is
 * drawn here, in the page itself, so the person sees what the agent touched in the frame's canvas and in production's assistant alike, and so it goes on its
 * own: nothing outside the page has to draw it, position it, or take it away.
 */

const STYLE_ID = 'acryl-door-outline-style'
/** The class the ring is drawn with: the page's element keeps its own styles, and an outline follows the element's shape. */
const CLASS = 'acrylDoorOutline'
/** How long the ring stays after the agent's last act; each act replaces it, so one run leaves one ring, a moment after its last step. */
export const OUTLINE_MS = 2000

const STYLES = `.${CLASS} { outline: 2px solid #3fb67b !important; outline-offset: 1px; }`

export interface Outlines {
  /** Ring `element` as what the agent just used; the previous ring goes. */
  touched(element: Element): void
  /** Take the ring off and remove the style: nothing of this remains in the page. */
  dispose(): void
}

/** Draw the ring in `document`. @returns the control the driver calls, and the disposer that leaves the page as it was. */
export function mountOutlines(document: Document): Outlines {
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.append(style)
  }
  let ringed: Element | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    ringed?.classList.remove(CLASS)
    ringed = undefined
  }
  return {
    touched(element: Element): void {
      // The same control again in one run keeps its ring where it is; the person sees one ring, not a flicker.
      if (element !== ringed) {
        ringed?.classList.remove(CLASS)
        ringed = element
        element.classList.add(CLASS)
      }
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(clear, OUTLINE_MS)
    },
    dispose(): void {
      clear()
      document.getElementById(STYLE_ID)?.remove()
    },
  }
}
