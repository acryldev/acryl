/**
 * The app's code, as the Host runs it (`../app-reload.ts`): the page asks the Host to answer when it changes and reloads the canvas when a new
 * generation of the app is up, so a version gone back to, a file the chat wrote or a line typed in an editor shows without a click. The ask is held by the
 * Host until something changes (a long poll), so there is no timer to wait on. A load the Host refused (a syntax error) leaves the canvas as it is and
 * is kept here for the bar to say.
 */

import { FRAME_APP_PATH, parseAppReloadView } from '../contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** What the bar shows: why the app was not loaded again, or nothing. */
export interface AppReloadSnapshot {
  readonly error: string | undefined
}

/** How long to wait before asking again after a failed ask (the Host restarting, the network). */
const RETRY_MS = 3000

export class AppReloadStore {
  private snapshot: AppReloadSnapshot = Object.freeze({ error: undefined })
  private readonly listeners = new Set<() => void>()

  constructor(
    /** Called when the app's code was loaded again: the canvas reloads. */
    private readonly onReloaded: () => void,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly delay: (ms: number, signal: AbortSignal) => Promise<void> = (ms, signal) => new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    }),
  ) {}

  getSnapshot(): AppReloadSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Follow the Host until `signal` aborts: the first answer says where the app is, each later one is a change. */
  async run(signal: AbortSignal): Promise<void> {
    let seq: number | undefined
    let generation: number | undefined
    while (!signal.aborted) {
      try {
        const response = await this.fetchImpl(seq === undefined ? FRAME_APP_PATH : `${FRAME_APP_PATH}?after=${String(seq)}`, { credentials: 'same-origin', cache: 'no-store', signal })
        // A Host without the reload (the launcher did not install it) answers 404: nothing to follow, nothing to show.
        if (response.status === 404) return
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const view = parseAppReloadView(await response.json())
        const reloaded = generation !== undefined && view.generation !== generation
        seq = view.seq
        generation = view.generation
        this.setError(view.error ?? undefined)
        if (reloaded) this.onReloaded()
      } catch {
        if (signal.aborted) return
        // The Host may have restarted with a counter of its own: ask for the state as it is, not for a change after a number it no longer has.
        seq = undefined
        await this.delay(RETRY_MS, signal)
      }
    }
  }

  private setError(error: string | undefined): void {
    if (error === this.snapshot.error) return
    this.snapshot = Object.freeze({ error })
    for (const listener of [...this.listeners]) listener()
  }
}
