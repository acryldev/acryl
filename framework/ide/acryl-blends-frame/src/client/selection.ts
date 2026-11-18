/**
 * An element the person picked in the app canvas, and the context the next chat message carries for it
 * (docs/design/blends-frame-mockup.html, scenario 2, "Building with the chat"). The frame owns the picker and the chip above the
 * composer; the send gesture hands the pick to the frame's Host, which gives it to the agent as context for that message, so the person's own
 * bubble keeps exactly their words.
 */

import { FRAME_SELECTION_PATH } from '../contract.ts'

/** One element picked in the app's page. `page` is the app path the canvas shows, with its query. */
export interface SelectedElement {
  readonly label: string
  readonly selector: string
  readonly page: string
}

/** One empty selection; the store publishes a frozen value so React compares it by identity. */
const EMPTY: { readonly selection: SelectedElement | undefined } = Object.freeze({ selection: undefined })

/** What the frame knows about the selected element; the chip and the send hook read it. */
export class SelectionStore {
  private snapshot: { readonly selection: SelectedElement | undefined } = EMPTY
  private readonly listeners = new Set<() => void>()

  getSnapshot(): { readonly selection: SelectedElement | undefined } {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  select(element: SelectedElement): void {
    this.publish({ selection: Object.freeze({ ...element }) })
  }

  clear(): void {
    if (this.snapshot.selection === undefined) return
    this.publish(EMPTY)
  }

  private publish(next: { readonly selection: SelectedElement | undefined }): void {
    this.snapshot = Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * A short name for an element: what it says it is, else its heading, else the first words it shows (a card's title, not its title run into the
 * line under it), else its tag (plugins/feedback/client.js).
 */
export function elementLabel(element: Element): string {
  const named = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? element.getAttribute('alt')
  if (named !== null && named !== '') return clip(named)
  // A heading names its section; bold text inside does not (a card's bold person name is not the card), so it falls to the first text.
  const heading = element.querySelector('h1, h2, h3, h4, h5, h6')
  const text = (heading?.textContent ?? firstText(element) ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? element.tagName.toLowerCase() : `"${clip(text)}"`
}

/** The first piece of text an element shows, in document order. */
function firstText(node: Node): string | undefined {
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && (child.textContent ?? '').trim() !== '') return child.textContent ?? undefined
    if (child.nodeType === 1) {
      const tag = (child as Element).tagName.toLowerCase()
      if (tag === 'script' || tag === 'style') continue
      const found = firstText(child)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function clip(text: string): string {
  return text.length > 36 ? `${text.slice(0, 34).trimEnd()}…` : text
}

/** A CSS selector that finds the element again: up from it to the nearest id, each step its tag and place among its siblings. */
export function elementSelector(element: Element): string {
  const parts: string[] = []
  for (let node: Element | null = element; node !== null && parts.length < 8; node = node.parentElement) {
    if (node.id !== '') {
      parts.unshift(`#${cssEscape(node.id)}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html') {
      parts.unshift(tag)
      break
    }
    const same = node.parentElement === null ? [] : [...node.parentElement.children].filter(child => child.tagName === node.tagName)
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${String(same.indexOf(node) + 1)})` : tag)
  }
  return parts.join(' > ')
}

function cssEscape(value: string): string {
  const escape = (globalThis.CSS as { escape?: (input: string) => string } | undefined)?.escape
  return typeof escape === 'function' ? escape(value) : value.replace(/[^A-Za-z0-9_-]/g, '\\$&')
}

/** The element under a click, described as the chat will carry it; `page` is the app page's path and query. */
export function selectedElement(element: Element, page: string): SelectedElement {
  return { label: elementLabel(element), selector: elementSelector(element), page }
}

/** Whether a draft carries a chat message the pick belongs to: it has words and is not a slash command (those are not chat messages). */
export function carriesSelection(draft: string): boolean {
  const text = draft.trim()
  return text !== '' && !text.startsWith('/')
}

/** What the frame's Host reads for one pick: the chat it belongs to and the element itself. */
export interface SelectionPost {
  readonly session: string
  readonly label: string
  readonly page: string
  readonly selector: string
}

/** The body one send gesture posts for its pick. */
export function selectionPost(session: string, element: SelectedElement): SelectionPost {
  return { session, label: element.label, page: element.page, selector: element.selector }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Hand the pick to the frame's Host at the person's send gesture, before the composer sends: the Host attaches it to the step that reads this
 * message and never writes it into the message (./selection-context.ts on the Host side). Nothing awaits the answer, so every send gesture keeps
 * working and a hand-off that fails costs only the context, never the person's message.
 * @param fetcher - the page's fetch.
 * @param session - the chat being sent to.
 * @param element - the picked element.
 * @returns whether the Host took it; the frame does not wait for this to send.
 */
export async function handOffSelection(fetcher: FetchLike, session: string, element: SelectedElement): Promise<boolean> {
  try {
    const response = await fetcher(FRAME_SELECTION_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(selectionPost(session, element)),
    })
    return response.ok
  } catch {
    // A pick the Host never gets is context the agent does without; the message the person wrote is already on its way.
    return false
  }
}
