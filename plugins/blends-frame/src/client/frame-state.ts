/**
 * What the frame shows around the app, from the Host's state route. The frame reads it again while the page is visible, so a version an agent saves
 * or a file it changes shows without a reload; a failed re-read keeps what is shown, and an unchanged answer tells no one.
 */

import { FRAME_STATE_PATH, parseFrameState, type FrameState } from '../contract.ts'

export type FrameStateView =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly state: FrameState }
  | { readonly status: 'error'; readonly message: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class FrameStateStore {
  private view: FrameStateView = Object.freeze({ status: 'loading' })
  private readonly listeners = new Set<() => void>()
  private generation = 0

  constructor(private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)) {}

  getSnapshot(): FrameStateView {
    return this.view
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Read the state again; an older answer arriving after a newer request is dropped. */
  async refresh(): Promise<void> {
    await this.read()
  }

  /**
   * Read the state now and return it: a decision that would act on the unsaved count (switch a branch, go back to a version) reads it here instead
   * of trusting what the last poll showed. Undefined when this read failed, even though the page keeps showing the last good state.
   */
  async current(): Promise<FrameState | undefined> {
    const next = await this.read()
    return next.status === 'ready' ? next.state : undefined
  }

  /** One read of the Host's state, published to the page unless a newer read started meanwhile; returns what this read got. */
  private async read(): Promise<FrameStateView> {
    const mine = ++this.generation
    let next: FrameStateView
    try {
      const response = await this.fetchImpl(FRAME_STATE_PATH, { credentials: 'same-origin' })
      if (response.status !== 200) throw new Error(`The Host answered ${String(response.status)}.`)
      next = { status: 'ready', state: parseFrameState(await response.json()) }
    } catch (cause) {
      next = { status: 'error', message: cause instanceof Error && cause.message !== '' ? cause.message : 'The Host could not be reached.' }
    }
    if (mine !== this.generation) return next
    if (next.status === 'error' && this.view.status === 'ready') return next
    if (JSON.stringify(next) === JSON.stringify(this.view)) return next
    this.view = Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
    return next
  }
}
