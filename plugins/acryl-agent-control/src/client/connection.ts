/**
 * The page's end of the Agent Control channel.
 *
 * It connects to the Host, answers each call by running it on the driver, and reconnects when the link drops.
 * It also tells the Host when this window is focused, so with several windows the agent drives the one the
 * user is using.
 */

import { UiControlError, parseChannelToPage, type ChannelToHost } from '../contract.ts'
import type { UiDriver } from './driver/driver.ts'

export const CHANNEL_PATH = '/api/acryl-agent-control/channel'

/** The slice of a WebSocket the channel uses, so tests can supply their own. */
export interface ChannelSocket {
  send(data: string): void
  close(): void
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  readonly readyState: number
}

const OPEN = 1
const BACKOFF_START_MS = 500
const BACKOFF_MAX_MS = 10_000

export function browserChannelUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${CHANNEL_PATH}`
}

export interface PageChannelOptions {
  readonly windowId: string
  readonly focused: () => boolean
  readonly createSocket?: (url: string) => ChannelSocket
  readonly url?: () => string
}

export class PageChannel {
  private socket: ChannelSocket | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private backoff = BACKOFF_START_MS
  private disposed = false

  constructor(private readonly driver: UiDriver, private readonly options: PageChannelOptions) {}

  connect(): void {
    if (this.disposed || this.socket !== undefined) return
    const create = this.options.createSocket ?? ((url: string): ChannelSocket => new WebSocket(url))
    const socket = create((this.options.url ?? browserChannelUrl)())
    this.socket = socket
    socket.onopen = () => {
      this.backoff = BACKOFF_START_MS
      this.send({ t: 'hello', windowId: this.options.windowId, focused: this.options.focused() })
    }
    socket.onmessage = (event) => {
      const text: unknown = event.data
      if (typeof text !== 'string') return
      this.answer(text)
    }
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined
      if (this.disposed) return
      this.timer = setTimeout(() => { this.timer = undefined; this.connect() }, this.backoff)
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
    }
    socket.onerror = () => { /* the close that follows drives the reconnect */ }
  }

  /** Tell the Host whether this window is the one in front. */
  reportFocus(focused: boolean): void {
    this.send({ t: 'focus', focused })
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
  }

  private answer(text: string): void {
    let call
    try {
      call = parseChannelToPage(text)
    } catch (cause) {
      // A malformed call carries no usable id; there is nothing to answer.
      void cause
      return
    }
    this.driver.handle(call.request).then(
      (value) => { this.send({ t: 'result', id: call.id, value }) },
      (cause: unknown) => {
        const failure = cause instanceof UiControlError ? cause : new UiControlError('not-actionable', cause instanceof Error ? cause.message : 'the action failed')
        this.send({ t: 'error', id: call.id, code: failure.code, message: failure.message })
      },
    )
  }

  private send(message: ChannelToHost): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(message))
  }
}
