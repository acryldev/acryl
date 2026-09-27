/** Tracks when the user last used the page, so the agent yields to them. */

/** Events only a real person produces: a script's `dispatchEvent` is never `isTrusted`. */
const USER_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const

export class UserInputClock {
  private last = Number.NEGATIVE_INFINITY

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Milliseconds since the user last touched the page; Infinity when they have not. */
  msSince = (): number => (this.last === Number.NEGATIVE_INFINITY ? Number.POSITIVE_INFINITY : this.now() - this.last)

  /** Start listening. @returns disposer. */
  attach(target: Document): () => void {
    const handler = (event: Event): void => { if (event.isTrusted) this.last = this.now() }
    for (const type of USER_EVENTS) target.addEventListener(type, handler, { capture: true, passive: true })
    return () => { for (const type of USER_EVENTS) target.removeEventListener(type, handler, { capture: true }) }
  }
}
