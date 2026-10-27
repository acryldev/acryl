/**
 * The page's end of the door's channel.
 *
 * It keeps an event stream open to the Host (`GET <base>/channel`), runs each call on the driver, and posts the answer back. The Host
 * writes a `ping` every few seconds; a stream silent for {@link SILENCE_MS} is dropped and opened again, so a page whose connection died
 * without an error (a sleeping laptop, a proxy) resumes on its own. A page that reconnects keeps its window id, and the Host settles a
 * call in flight on the old stream as `disconnected`.
 */

import { UiControlError, parseChannelToPage, type ChannelToHost } from './protocol.ts'
import type { UiDriver } from './driver/driver.ts'

/** The slice of an `EventSource` the channel uses, so tests can supply their own. */
export interface ChannelSource {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  onerror: ((event: Event) => void) | null
  close(): void
  readonly readyState: number
}

/** The Host's heartbeat is 15 s; three missed beats and the stream counts as dead. */
export const SILENCE_MS = 45_000
const CLOSED = 2
const BACKOFF_START_MS = 500
const BACKOFF_MAX_MS = 10_000

export interface PageChannelOptions {
  readonly windowId: string
  readonly focused: () => boolean
  /** Where the door's routes are, e.g. `/api/acryl-door`. */
  readonly base: string
  readonly createSource?: (url: string) => ChannelSource
  readonly post?: (url: string, body: string) => Promise<unknown>
  readonly silenceMs?: number
  readonly now?: () => number
}

export class PageChannel {
  private source: ChannelSource | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setInterval> | undefined
  private backoff = BACKOFF_START_MS
  private lastHeard = 0
  private disposed = false
  private readonly now: () => number

  private readonly driver: UiDriver
  private readonly options: PageChannelOptions

  constructor(driver: UiDriver, options: PageChannelOptions) {
    this.driver = driver
    this.options = options
    this.now = options.now ?? (() => Date.now())
  }

  connect(): void {
    if (this.disposed || this.source !== undefined) return
    const create = this.options.createSource ?? ((url: string): ChannelSource => new EventSource(url))
    const query = `window=${encodeURIComponent(this.options.windowId)}&focused=${this.options.focused() ? '1' : '0'}`
    const source = create(`${this.options.base}/channel?${query}`)
    this.source = source
    this.lastHeard = this.now()
    const heard = (): void => {
      this.lastHeard = this.now()
      this.backoff = BACKOFF_START_MS
    }
    source.addEventListener('ready', heard)
    source.addEventListener('ping', heard)
    source.addEventListener('call', (event) => {
      heard()
      if (typeof event.data === 'string') this.answer(event.data)
    })
    // An EventSource retries by itself after a network error; once it gives up (CLOSED), the channel starts over.
    source.onerror = () => { if (source.readyState === CLOSED) this.restart(source) }
    const silence = this.options.silenceMs ?? SILENCE_MS
    this.watchdog = setInterval(() => {
      if (this.now() - this.lastHeard > silence) this.restart(source)
    }, Math.max(50, Math.floor(silence / 3)))
  }

  /** Tell the Host whether this window is the one in front. */
  reportFocus(focused: boolean): void {
    this.send({ t: 'focus', focused })
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer)
    this.stop()
  }

  /** Drop the stream and open a new one after the backoff. */
  private restart(source: ChannelSource): void {
    if (this.source !== source) return
    this.stop()
    if (this.disposed) return
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect() }, this.backoff)
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
  }

  private stop(): void {
    if (this.watchdog !== undefined) clearInterval(this.watchdog)
    this.watchdog = undefined
    const source = this.source
    this.source = undefined
    if (source !== undefined) {
      source.onerror = null
      source.close()
    }
  }

  private answer(text: string): void {
    let call
    try {
      call = parseChannelToPage(text)
    } catch {
      // A malformed call carries no usable id; there is nothing to answer.
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
    const post = this.options.post ?? ((url: string, body: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))
    post(`${this.options.base}/channel/answer`, JSON.stringify({ window: this.options.windowId, message })).catch(() => {
      // The Host is gone or restarting; the call it made settles on its side.
    })
  }
}
