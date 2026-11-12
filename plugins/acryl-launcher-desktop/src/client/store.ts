/** Whether the ACRYL screen is over the app. One small observable: the screen reads it, and so can anything that wants to open ACRYL again. */
export class LauncherVisibility {
  #open: boolean
  readonly #listeners = new Set<() => void>()

  /** The screen is the first screen of the app, so it starts open. */
  constructor(open = true) { this.#open = open }

  isOpen = (): boolean => this.#open

  set(open: boolean): void {
    if (open === this.#open) return
    this.#open = open
    for (const listener of this.#listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
}
