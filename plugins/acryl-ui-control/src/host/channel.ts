/**
 * The Host's side of the page channel: the connected ACRYL windows, and calls that go to the current one.
 *
 * The Host cannot reach into a page, so each page opens one WebSocket to the Host and answers calls over it.
 * This is the one implementation for Web and Desktop (a Desktop window is a page served by the same Host).
 * With several windows open, the one the user focused last is the one the agent drives.
 */

import {
  UiControlError,
  type ChannelToHost,
  type ChannelToPage,
  type UiRequest,
  type UiResult,
} from '../contract.ts'

/** The slice of a socket the channel needs, so tests can supply their own. */
export interface PageSocket {
  send(data: string): void
  close(): void
}

interface Pending {
  readonly connection: Connection
  readonly resolve: (value: UiResult) => void
  readonly reject: (cause: UiControlError) => void
  readonly timer: NodeJS.Timeout
  readonly cleanup: () => void
}

interface Connection {
  readonly socket: PageSocket
  windowId: string
  focused: boolean
  /** Order of last focus (or connection), so the most recent wins. */
  lastActive: number
}

/** How long a call may take before it is given up (a wait may take up to 10 seconds itself). */
const DEFAULT_CALL_TIMEOUT_MS = 30_000

export class UiChannel {
  private readonly connections = new Set<Connection>()
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private clock = 0
  private closed = false

  /** Register a connected page. @returns handlers for what it sends, and for its socket closing. */
  attach(socket: PageSocket): { onMessage(message: ChannelToHost): void; onClose(): void } {
    const connection: Connection = { socket, windowId: '', focused: false, lastActive: ++this.clock }
    this.connections.add(connection)
    return {
      onMessage: (message) => { this.handle(connection, message) },
      onClose: () => {
        this.connections.delete(connection)
        for (const [id, entry] of [...this.pending]) {
          if (entry.connection === connection) this.settle(id, undefined, new UiControlError('no-window', 'the ACRYL window closed before it answered'))
        }
      },
    }
  }

  /** True when at least one page is connected. */
  get connected(): boolean {
    return this.connections.size > 0
  }

  /** The windows currently connected, most recently active first (for diagnostics and tests). */
  windows(): readonly { windowId: string; focused: boolean }[] {
    return [...this.connections].sort((a, b) => b.lastActive - a.lastActive).map(({ windowId, focused }) => ({ windowId, focused }))
  }

  /**
   * Ask the current page to do something.
   * @throws UiControlError `no-window`, `timeout`, `aborted`, `unloaded`, or whatever the page refused with.
   */
  call(request: UiRequest, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<UiResult> {
    if (this.closed) return Promise.reject(new UiControlError('unloaded', 'Agent Control was unloaded'))
    const target = [...this.connections].sort((a, b) => b.lastActive - a.lastActive)[0]
    if (target === undefined) return Promise.reject(new UiControlError('no-window', 'no ACRYL window is open to control'))
    const signal = options.signal
    if (signal?.aborted === true) return Promise.reject(new UiControlError('aborted', 'the call was cancelled'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<UiResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.settle(id, undefined, new UiControlError('timeout', 'the ACRYL window did not answer in time')) }, options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS)
      const onAbort = (): void => { this.settle(id, undefined, new UiControlError('aborted', 'the call was cancelled')) }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, { connection: target, resolve, reject, timer, cleanup: () => { signal?.removeEventListener('abort', onAbort) } })
      const frame: ChannelToPage = { t: 'call', id, request }
      try {
        target.socket.send(JSON.stringify(frame))
      } catch {
        this.settle(id, undefined, new UiControlError('no-window', 'the ACRYL window could not be reached'))
      }
    })
  }

  /** Close every page and settle every pending call as `unloaded`. */
  close(): void {
    this.closed = true
    for (const id of [...this.pending.keys()]) this.settle(id, undefined, new UiControlError('unloaded', 'Agent Control was unloaded'))
    for (const connection of [...this.connections]) connection.socket.close()
    this.connections.clear()
  }

  private handle(connection: Connection, message: ChannelToHost): void {
    if (message.t === 'hello') {
      connection.windowId = message.windowId
      connection.focused = message.focused
      if (message.focused) connection.lastActive = ++this.clock
      return
    }
    if (message.t === 'focus') {
      connection.focused = message.focused
      if (message.focused) connection.lastActive = ++this.clock
      return
    }
    const entry = this.pending.get(message.id)
    // Only the window that was asked may answer, so another page cannot forge a result.
    if (entry === undefined || entry.connection !== connection) return
    if (message.t === 'result') this.settle(message.id, message.value)
    else this.settle(message.id, undefined, new UiControlError(message.code, message.message))
  }

  private settle(id: number, value: UiResult | undefined, failure?: UiControlError): void {
    const entry = this.pending.get(id)
    if (entry === undefined) return
    this.pending.delete(id)
    clearTimeout(entry.timer)
    entry.cleanup()
    if (failure !== undefined) entry.reject(failure)
    else if (value !== undefined) entry.resolve(value)
  }
}
