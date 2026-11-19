/**
 * An in-process WebSocket pair for tests (spec 047 T009): runs an upgrade route the way the adapters do, with no socket and no network. `testWebSocket(fetch, '/path', { headers })`
 * answers either a refusal (`status`, no `socket`) or an accepted connection whose client side sends text frames, receives what the handler sent, and closes.
 *
 *   const { socket } = await testWebSocket((request, env) => app.fetch(request, env), '/stream', { headers: { origin: 'http://127.0.0.1:3000' } })
 *   socket.send('hello'); expect(socket.received).toEqual(['echo hello'])
 */
import type { IncomingMessage } from 'node:http'
import { CONNECTION_SYMBOL_KEY, WAIT_FOR_WEBSOCKET_SYMBOL } from './adapter/websocket.ts'
import type { WebSocketData, WebSocketLike } from './adapter/websocket-types.ts'

type Listener = (...args: never[]) => void

/** The client side of an accepted test connection. */
export interface TestSocket {
  /** Frames the handler sent, in order (text only). */
  readonly received: string[]
  /** The code and reason the handler closed with, when it did. */
  readonly closed: { readonly code: number | undefined; readonly reason: string | undefined } | undefined
  /** Send a text frame to the handler. */
  send(text: string): void
  /** Close from the client side. */
  close(code?: number, reason?: string): void
}

export interface TestWebSocketOptions {
  readonly headers?: Record<string, string>
  /** The socket's peer address and local port, as an adapter would pass them. */
  readonly connection?: { readonly remoteAddress?: string; readonly localPort?: number }
  /** The URL origin the request is made against; default `http://127.0.0.1`. */
  readonly base?: string
}

export interface TestWebSocketResult {
  /** The refusal's status, or 101 when the upgrade was accepted. */
  readonly status: number
  readonly socket?: TestSocket
}

/** A fake `ws` socket: events go both ways without a network. */
class FakeSocket implements WebSocketLike {
  protocol = ''
  readyState: 0 | 1 | 2 | 3 = 1
  bufferedAmount = 0
  readonly sent: string[] = []
  closedWith: { code: number | undefined; reason: string | undefined } | undefined
  private readonly listeners = new Map<string, Listener[]>()
  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }
  off(event: string, listener: Listener): this {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter(l => l !== listener))
    return this
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args)
  }
  send(data: WebSocketData | ArrayBufferView): void {
    this.sent.push(typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8'))
  }
  close(code?: number, reason?: string): void {
    if (this.readyState === 3) return
    this.closedWith = { code, reason }
    this.readyState = 3
    this.emit('close', code ?? 1005, Buffer.from(reason ?? ''))
  }
  ping(): void {}
  terminate(): void {
    this.close(1006)
  }
}

export async function testWebSocket(
  fetch: (request: Request, env: object) => Promise<Response>,
  path: string,
  options: TestWebSocketOptions = {},
): Promise<TestWebSocketResult> {
  const fake = new FakeSocket()
  let waiter: { connectionSymbol: symbol; resolve: (ws: WebSocketLike) => void } | undefined
  const incoming = { headers: options.headers ?? {}, socket: { remoteAddress: options.connection?.remoteAddress, localPort: options.connection?.localPort } } as unknown as IncomingMessage
  const env: Record<symbol | string, unknown> = {
    incoming,
    outgoing: undefined,
    wss: {},
    [WAIT_FOR_WEBSOCKET_SYMBOL]: (_request: IncomingMessage, connectionSymbol: symbol) =>
      new Promise<WebSocketLike>(resolve => {
        waiter = { connectionSymbol, resolve }
      }),
  }
  const headers = new Headers({ upgrade: 'websocket', connection: 'Upgrade', ...options.headers })
  const response = await fetch(new Request(new URL(path, options.base ?? 'http://127.0.0.1'), { headers }), env)
  if (!waiter || waiter.connectionSymbol !== env[CONNECTION_SYMBOL_KEY]) return { status: response.status }
  waiter.resolve(fake)
  // The handler's open event and buffered messages run on the next turns.
  await new Promise(resolve => setTimeout(resolve, 0))
  const socket: TestSocket = {
    received: fake.sent,
    get closed() {
      return fake.closedWith
    },
    send: text => fake.emit('message', text, false),
    close: (code, reason) => {
      if (fake.readyState === 3) return
      fake.readyState = 3
      fake.emit('close', code ?? 1005, Buffer.from(reason ?? ''))
    },
  }
  return { status: 101, socket }
}
