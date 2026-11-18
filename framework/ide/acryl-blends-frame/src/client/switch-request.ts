/**
 * A chat that lives on another branch, asked for from somewhere other than the left panel (the chat's History): the left panel owns the switch, with its
 * save point and its guard, so the History hands the request to it instead of switching by itself.
 */

export interface SwitchRequest {
  readonly branch: string
  /** The chat to open once the folder has moved. */
  readonly chat: string
}

export class SwitchRequests {
  private pending: SwitchRequest | undefined
  private readonly listeners = new Set<() => void>()

  getSnapshot(): SwitchRequest | undefined {
    return this.pending
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  request(request: SwitchRequest): void {
    this.pending = request
    for (const listener of [...this.listeners]) listener()
  }

  /** The left panel took the request. */
  clear(): void {
    if (this.pending === undefined) return
    this.pending = undefined
    for (const listener of [...this.listeners]) listener()
  }
}
