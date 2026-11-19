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
import { type SocketLike, type SocketSource, socketSource } from './socket-source.ts'

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
  /** The browser tab the page is in (kept across the tab's reloads and moves), so the Host follows a run's page into the next document of its tab. */
  readonly tab?: string
  /** The desktop window this page is in (`AcrylWindow/<n>` in the user agent, set by the Electron shell), so the Host can drive it by the number `window list` prints. */
  readonly shellWindow?: number
  readonly focused: () => boolean
  /** Where the door's routes are, e.g. `/api/acryl-door`. */
  readonly base: string
  readonly createSource?: (url: string) => ChannelSource
  /** Opens the WebSocket form of the channel (`<base>/channel/ws`); the browser's own by default. Pass `transport: 'stream'` to keep to the event stream. */
  readonly createSocket?: (url: string) => SocketSource
  readonly transport?: 'auto' | 'stream'
  /** Where the page says it fell back to the event stream (the console by default). */
  readonly warn?: (message: string) => void
  readonly post?: (url: string, body: string) => Promise<unknown>
  readonly silenceMs?: number
  readonly now?: () => number
  /** The Host says a run asked for from this page's panel started (`true`) or ended (`false`); false too when the stream is lost, until the Host says again. */
  readonly onRun?: (running: boolean) => void
}

export class PageChannel {
  private source: ChannelSource | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setInterval> | undefined
  private backoff = BACKOFF_START_MS
  /** The WebSocket form is tried first; once it fails to open (a proxy that cannot upgrade, no `ws` on the server) the page keeps to the event stream. */
  private socketAllowed: boolean
  private socketReady = false
  private lastHeard = 0
  private disposed = false
  private readonly now: () => number

  private readonly driver: UiDriver
  private readonly options: PageChannelOptions

  constructor(driver: UiDriver, options: PageChannelOptions) {
    this.driver = driver
    this.options = options
    this.now = options.now ?? (() => Date.now())
    // A test that supplies only a stream keeps to it; the browser's own WebSocket is tried when the page supplies neither.
    this.socketAllowed = options.transport !== 'stream' && (options.createSocket !== undefined || (options.createSource === undefined && typeof WebSocket !== 'undefined'))
  }

  connect(): void {
    if (this.disposed || this.source !== undefined) return
    const query = `window=${encodeURIComponent(this.options.windowId)}&focused=${this.options.focused() ? '1' : '0'}${this.options.shellWindow === undefined ? '' : `&shell=${String(this.options.shellWindow)}`}${this.options.tab === undefined ? '' : `&tab=${encodeURIComponent(this.options.tab)}`}`
    const viaSocket = this.socketAllowed
    this.socketReady = false
    const source: ChannelSource = viaSocket
      ? (this.options.createSocket ?? ((url: string): SocketSource => socketSource(new WebSocket(url) as unknown as SocketLike)))(`${socketBase(this.options.base)}/channel/ws?${query}`)
      : (this.options.createSource ?? ((url: string): ChannelSource => new EventSource(url) as unknown as ChannelSource))(`${this.options.base}/channel?${query}`)
    this.source = source
    this.lastHeard = this.now()
    const heard = (): void => {
      this.lastHeard = this.now()
      this.backoff = BACKOFF_START_MS
    }
    source.addEventListener('ready', () => {
      this.socketReady = true
      heard()
    })
    source.addEventListener('ping', heard)
    source.addEventListener('run', (event) => {
      heard()
      this.options.onRun?.(event.data === '1')
    })
    source.addEventListener('call', (event) => {
      heard()
      if (typeof event.data === 'string') this.answer(event.data)
    })
    // An EventSource retries by itself after a network error; once it gives up (CLOSED), the channel starts over. A WebSocket that never became ready is not retried: the page
    // falls back to the event stream, and says so once.
    source.onerror = () => {
      if (source.readyState !== CLOSED) return
      if (viaSocket && !this.socketReady) this.fallBack(source)
      else this.restart(source)
    }
    const silence = this.options.silenceMs ?? SILENCE_MS
    this.watchdog = setInterval(() => {
      if (this.now() - this.lastHeard > silence) this.restart(source)
    }, Math.max(50, Math.floor(silence / 3)))
  }

  /** The WebSocket did not open: use the event stream from now on, and say why once. */
  private fallBack(source: ChannelSource): void {
    if (this.source !== source) return
    this.socketAllowed = false
    const warn = this.options.warn ?? ((message: string) => { console.warn(message) })
    warn('acryl-door: the page channel could not open a WebSocket (the server has no upgrade route, or a proxy refused it); using server-sent events, which count against the browser\'s six connections per host')
    this.stop()
    this.connect()
  }

  /** Tell the Host whether this window is the one in front. */
  reportFocus(focused: boolean): void {
    this.send({ t: 'focus', focused })
  }

  /**
   * Let go of the stream without ending the channel: the page is going away but the browser may keep it (the back/forward cache keeps a page that was left, still holding its
   * connections). A browser allows six connections per host, so pages kept like that would queue the live page's own answers behind them. `resume` opens the stream again.
   */
  suspend(): void {
    if (this.disposed) return
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.stop()
  }

  /** The page is back (restored from the cache): open the stream again with the same window id. */
  resume(): void {
    if (this.disposed) return
    this.backoff = BACKOFF_START_MS
    this.connect()
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
      // Without the stream the page cannot hear the run end: the Host says again if it is still going, once the stream is back.
      this.options.onRun?.(false)
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
    // Alive: said before anything is done, so the Host can tell a page that heard the call from one that is frozen or gone.
    this.send({ t: 'ack', id: call.id })
    this.driver.handle(call.request).then(
      (value) => { this.send({ t: 'result', id: call.id, value }) },
      (cause: unknown) => {
        const failure = cause instanceof UiControlError ? cause : new UiControlError('not-actionable', cause instanceof Error ? cause.message : 'the action failed')
        this.send({ t: 'error', id: call.id, code: failure.code, message: failure.message })
      },
    )
  }

  private send(message: ChannelToHost): void {
    // On a WebSocket the answer goes up the socket: a request would queue behind the browser's six connections per host.
    const source = this.source as Partial<SocketSource> | undefined
    if (source?.send?.(JSON.stringify(message)) === true) return
    const post = this.options.post ?? ((url: string, body: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))
    post(`${this.options.base}/channel/answer`, JSON.stringify({ window: this.options.windowId, message })).catch(() => {
      // The Host is gone or restarting; the call it made settles on its side.
    })
  }
}

/** The WebSocket address of the door's routes: this page's own origin, `ws:` or `wss:`, then the base path. */
function socketBase(base: string): string {
  const here = (globalThis as { location?: { protocol: string; host: string } }).location
  if (here === undefined) return base
  return `${here.protocol === 'https:' ? 'wss' : 'ws'}://${here.host}${base}`
}
