/**
 * Diagnostic: describe the height chain around the chat so a "cannot scroll" report can be settled
 * from measurements instead of guesses. Renderer `console.error` output is written to the app's
 * log file, so the report can be read without the user opening developer tools.
 */

export interface ProbeNode {
  readonly el: string
  readonly slot: string | null
  readonly display: string
  readonly position: string
  readonly flex: string
  readonly height: string
  readonly minHeight: string
  readonly overflowY: string
  readonly client: number
  readonly scroll: number
}

export interface ProbeReport {
  readonly viewport: number
  /** Ancestors from the conversation wrapper up to the desktop frame, innermost first. */
  readonly chain: readonly ProbeNode[]
  /** The element inside the conversation that scrolls, when one is found. */
  readonly scroller: ProbeNode | null
  /** Bottom edge of the composer (the message box) in viewport pixels, or null when not found. */
  readonly composerBottom: number | null
  readonly verdict: string
}

function describe(el: Element, view: Window): ProbeNode {
  const style = view.getComputedStyle(el)
  const classes = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
  return {
    el: `${el.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`}`,
    slot: el.getAttribute('data-acryl-slot'),
    display: style.display,
    position: style.position,
    flex: `${style.flexGrow} ${style.flexShrink} ${style.flexBasis}`,
    height: style.height,
    minHeight: style.minHeight,
    overflowY: style.overflowY,
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }
}

function findScroller(root: Element, view: Window): Element | null {
  let best: Element | null = null
  for (const el of root.querySelectorAll('*')) {
    const overflow = view.getComputedStyle(el).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && (best === null || el.scrollHeight > best.scrollHeight)) {
      best = el
    }
  }
  return best
}

/**
 * @param wrapper - the element the frame puts around the conversation (`data-acryl-slot="conversation"`).
 * @param view - the window whose computed styles are read.
 */
export function probeChatLayout(wrapper: Element, view: Window = window): ProbeReport {
  const chain: ProbeNode[] = []
  for (let el: Element | null = wrapper; el !== null && chain.length < 12; el = el.parentElement) {
    chain.push(describe(el, view))
    if (el.classList.contains('dshDesktopFrame')) break
  }
  const scrollerEl = findScroller(wrapper, view)
  const scroller = scrollerEl === null ? null : describe(scrollerEl, view)
  const composer = wrapper.querySelector('[data-conversation-composer-overlay]') ?? wrapper.querySelector('textarea')
  const composerBottom = composer === null ? null : Math.round(composer.getBoundingClientRect().bottom)
  const viewport = view.innerHeight

  let verdict: string
  if (scroller === null) verdict = 'no scrolling element found inside the conversation'
  else if (scroller.scroll <= scroller.client) verdict = 'scroller is not overflowing (it is as tall as its content, so it will not scroll)'
  else if (composerBottom !== null && composerBottom > viewport + 1) verdict = 'composer is below the window: the chat is taller than the window'
  else verdict = 'scroller overflows and the composer is inside the window: scrolling should work'
  return { viewport, chain, scroller, composerBottom, verdict }
}

/** One line of JSON, so it stays a single entry in the log file. */
export function formatProbe(report: ProbeReport): string {
  return `[acryl-layout] ${JSON.stringify(report)}`
}
