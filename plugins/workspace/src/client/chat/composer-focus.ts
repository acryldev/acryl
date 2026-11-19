/** Focus the chat composer once the chat surface has rendered, so a page that was reloaded is ready to type into. */

/**
 * The message box DSH renders; its accessible name is the placeholder when it is empty ("Describe what you want to build…").
 * A contenteditable with that name is the composer, and nothing else in the frame uses it.
 */
const COMPOSER_SELECTOR = '[contenteditable=true][aria-label^="Describe"]'

/** How long to watch after a chat becomes the shown tab: on a reload the session list and the chat client arrive asynchronously. */
export const COMPOSER_FOCUS_WATCH_MS = 30_000

/** How often to look while watching. */
export const COMPOSER_FOCUS_POLL_MS = 150

/**
 * Whether something else already has the person's attention: a dialog or menu owns the page, or any element other than the page body has
 * focus (a field they are typing in, a tab they just clicked). Focusing then would take focus out of their hands.
 */
function busy(doc: Document): boolean {
  if (doc.querySelector('[role=dialog], [role=menu]') !== null) return true
  const active = doc.activeElement
  return active !== null && active !== doc.body && active !== doc.documentElement
}

/**
 * Watch for the chat composer and focus it while the chat is shown.
 *
 * After a reload the chat surface mounts before the composer does, and nothing moves focus into the message box, so the page lands with focus on
 * the body and an attendee has to click the box before the first word. The same happens when the surface re-renders while the worktree restore
 * settles and the focused node is replaced: focus falls back to the body. Both recover here, because the watch keeps looking while it runs and
 * acts only when focus is on the page itself.
 *
 * @returns a disposer that stops the watch; call it when the chat is no longer shown or the canvas unmounts.
 */
export function focusChatComposer(
  doc: Document = document,
  watchMs: number = COMPOSER_FOCUS_WATCH_MS,
  pollMs: number = COMPOSER_FOCUS_POLL_MS,
): () => void {
  const deadline = Date.now() + watchMs
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = (): void => {
    if (timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }
  const look = (): void => {
    if (Date.now() >= deadline) {
      stop()
      return
    }
    if (busy(doc)) return
    const composer = doc.querySelector<HTMLElement>(COMPOSER_SELECTOR)
    if (composer === null) return
    composer.focus({ preventScroll: true })
  }
  timer = setInterval(look, pollMs)
  look()
  return stop
}
