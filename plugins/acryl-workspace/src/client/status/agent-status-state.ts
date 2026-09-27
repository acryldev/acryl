/**
 * What each terminal agent reports it is doing, kept fresh by polling. A change of state is observable, and the
 * moment an agent starts needing you is a separate event so the page can raise a notice exactly once.
 */

import type { AgentState } from '../../agents/status/agent-status.ts'
import type { AgentStatusApi } from './agent-status-api.ts'

export const STATUS_POLL_MS = 2000

export class AgentStatusState {
  private states: ReadonlyMap<string, AgentState> = new Map()
  private readonly listeners = new Set<() => void>()
  private readonly needsYouListeners = new Set<(terminalId: string) => void>()
  private loaded = false

  constructor(private readonly api: AgentStatusApi) {}

  /** A new map on every change, so it is safe as a `useSyncExternalStore` snapshot. */
  getSnapshot = (): ReadonlyMap<string, AgentState> => this.states

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Be told when an agent goes from anything else to waiting for you. @returns disposer. */
  onNeedsYou(listener: (terminalId: string) => void): () => void {
    this.needsYouListeners.add(listener)
    return () => { this.needsYouListeners.delete(listener) }
  }

  /** Ask the Host now. A Host without the route, or a failed request, leaves the last answer in place. */
  async refresh(): Promise<void> {
    let list
    try {
      list = await this.api.list()
    } catch {
      return
    }
    const next = new Map(list.map(entry => [entry.terminalId, entry.state] as const))
    const before = this.states
    const changed = next.size !== before.size || [...next].some(([id, state]) => before.get(id) !== state)
    if (!changed && this.loaded) return
    const firstLoad = !this.loaded
    this.loaded = true
    this.states = next
    // What was already waiting when the page opened is not news.
    if (!firstLoad) {
      for (const [id, state] of next) {
        if (state === 'waiting' && before.get(id) !== 'waiting') for (const listener of [...this.needsYouListeners]) listener(id)
      }
    }
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * Poll while the page is visible.
   * @returns disposer, for one owning effect.
   */
  start(intervalMs = STATUS_POLL_MS, isVisible: () => boolean = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'): () => void {
    void this.refresh()
    const timer = setInterval(() => { if (isVisible()) void this.refresh() }, intervalMs)
    return () => { clearInterval(timer) }
  }
}
