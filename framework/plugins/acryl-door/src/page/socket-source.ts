/**
 * A WebSocket that looks like the event stream the channel already runs on: `addEventListener('call' | 'ready' | 'ping')`, `onerror`, `close()` and `readyState` (0 connecting, 1 open,
 * 2 closed). Each frame from the Host is `{ "e": <event>, "d": <data> }`. It can also send, so the page's answers go up the same socket and need no request of their own: a request
 * would wait behind the browser's six connections per host, which is what the socket is for.
 */

import type { ChannelSource } from './channel.ts'

/** The slice of the browser's `WebSocket` used here, so a test can supply its own. */
export interface SocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface SocketSource extends ChannelSource {
  /** Send one message up; false when the socket is not open (the caller posts it instead). */
  send(text: string): boolean
}

export function socketSource(socket: SocketLike): SocketSource {
  const listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  let closed = false
  const source: SocketSource = {
    onerror: null,
    get readyState(): number {
      return closed || socket.readyState >= 2 ? 2 : socket.readyState
    },
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    send(text) {
      if (socket.readyState !== 1) return false
      try {
        socket.send(text)
        return true
      } catch {
        return false
      }
    },
    close() {
      closed = true
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      try {
        socket.close(1000, 'page left')
      } catch {
        // Already closed.
      }
    },
  }
  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    let frame: { e?: unknown; d?: unknown }
    try {
      frame = JSON.parse(event.data) as { e?: unknown; d?: unknown }
    } catch {
      return
    }
    if (typeof frame.e !== 'string') return
    for (const listener of listeners.get(frame.e) ?? []) listener({ data: typeof frame.d === 'string' ? frame.d : '' } as MessageEvent)
  }
  // An error or a close that this side did not ask for is the channel's cue to start over, or to fall back to the event stream.
  const lost = (event: Event): void => {
    if (!closed) source.onerror?.(event)
  }
  socket.onerror = lost
  socket.onclose = lost
  return source
}
