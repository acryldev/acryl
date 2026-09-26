/**
 * The browser end of one terminal's live stream (see `src/pty/stream.ts`).
 *
 * It remembers how far the terminal has been shown (the cursor), so when the connection drops it
 * reconnects and asks only for what it missed. Input and resizes made while offline wait in order and go
 * out first once the connection is back. It never guesses: a closed session or an exit ends it.
 */

import {
  WORKSPACE_PTY_STREAM_PATH,
  parsePtyServerMessage,
  type PtyClientMessage,
} from '../../pty/contract.ts'

export type PtyStreamState = 'connecting' | 'live' | 'reconnecting' | 'exited' | 'lost'

export interface PtyStreamHandlers {
  /** New output. `replace` means clear the terminal first (more was missed than the Host kept). */
  output(data: string, replace: boolean): void
  state(state: PtyStreamState): void
  exit(exitCode: number | null, error: string | null): void
}

/** The slice of the browser WebSocket the stream uses, so tests can supply their own. */
export interface StreamSocket {
  send(data: string): void
  close(): void
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  readonly readyState: number
}

export type StreamSocketFactory = (url: string) => StreamSocket

const OPEN = 1
const LOST_CODE = 4404
const MAX_QUEUED_INPUT_CHARS = 64 * 1024
const BACKOFF_START_MS = 250
const BACKOFF_MAX_MS = 5_000

export function browserStreamUrl(id: string, cursor: number): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${WORKSPACE_PTY_STREAM_PATH}?id=${encodeURIComponent(id)}&since=${String(cursor)}`
}

export class PtyStream {
  private socket: StreamSocket | undefined
  private cursor = 0
  private ended = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private backoff = BACKOFF_START_MS
  private queuedInput = ''
  private size: { readonly cols: number; readonly rows: number } | undefined

  constructor(
    private readonly id: string,
    private readonly handlers: PtyStreamHandlers,
    private readonly createSocket: StreamSocketFactory = url => new WebSocket(url),
    private readonly urlFor: (id: string, cursor: number) => string = browserStreamUrl,
  ) {}

  connect(): void {
    if (this.ended || this.socket !== undefined) return
    this.handlers.state(this.cursor === 0 ? 'connecting' : 'reconnecting')
    const socket = this.createSocket(this.urlFor(this.id, this.cursor))
    this.socket = socket
    socket.onopen = () => {
      this.backoff = BACKOFF_START_MS
      this.handlers.state('live')
      // Size first, so what the process draws next already fits; then whatever was typed while offline.
      if (this.size !== undefined) this.transmit({ t: 'resize', ...this.size })
      if (this.queuedInput !== '') {
        this.transmit({ t: 'in', data: this.queuedInput })
        this.queuedInput = ''
      }
    }
    socket.onmessage = (event) => {
      const text: unknown = event.data
      if (typeof text !== 'string') return
      let message
      try {
        message = parsePtyServerMessage(text)
      } catch {
        return
      }
      if (message.t === 'out') {
        this.cursor = message.cursor
        this.handlers.output(message.data, message.replace)
        return
      }
      this.ended = true
      this.handlers.state('exited')
      this.handlers.exit(message.exitCode, message.error)
    }
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = undefined
      if (this.ended) return
      if (event.code === LOST_CODE) {
        this.ended = true
        this.handlers.state('lost')
        return
      }
      this.handlers.state('reconnecting')
      this.timer = setTimeout(() => { this.timer = undefined; this.connect() }, this.backoff)
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
    }
    socket.onerror = () => { /* the close event that follows drives the reconnect */ }
  }

  /** Keystrokes and pasted text, delivered in order (held back while offline, up to a cap). */
  input(data: string): void {
    if (this.ended) return
    if (this.socket?.readyState === OPEN) this.transmit({ t: 'in', data })
    else if (this.queuedInput.length + data.length <= MAX_QUEUED_INPUT_CHARS) this.queuedInput += data
  }

  resize(cols: number, rows: number): void {
    this.size = { cols, rows }
    if (this.socket?.readyState === OPEN) this.transmit({ t: 'resize', cols, rows })
  }

  dispose(): void {
    this.ended = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
  }

  private transmit(message: PtyClientMessage): void {
    this.socket?.send(JSON.stringify(message))
  }
}
