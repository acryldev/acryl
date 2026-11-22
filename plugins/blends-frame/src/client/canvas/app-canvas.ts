/**
 * The app page the canvas shows, and the calls a person or the agent may make on it (docs/plans/ide-host-inversion.md section 31, boundary A).
 *
 * The canvas is a value, not a surface: the React component renders whatever this state says, and a navigation or a reload is a new address or a
 * new attempt, which makes a NEW frame. A frame is never re-pointed at another address - that is what let a late load from an earlier address
 * pass for this one's answer and replace a live app page (section 30) - and nothing here reloads on its own: only `navigate` and `reload`, which
 * only a person, the door or a change of the app's code calls. A reload keeps the page the app is on (`reload`).
 */

/** The key the door publishes `{ windowId }` on the page's window (plugins/door/src/page/index.ts, `PAGE_KEY`). */
export const DOOR_PAGE_KEY: symbol = Symbol.for('acryl.door.page')

export interface AppCanvasView {
  /** The absolute address of the app's own page, or undefined when the Host serves none. */
  readonly address: string | undefined
  /** How many reloads were asked for; each mounts a fresh frame at the same address. */
  readonly attempt: number
  /** The last load the component saw, with whether the document was readable (a same-origin app page always is). */
  readonly loaded: { readonly address: string; readonly readable: boolean } | undefined
}

export interface AppCanvas {
  /** The address the canvas shows, absolute; undefined when the Host serves no app. */
  address(): string | undefined
  /** Point the canvas at a path on the frame's origin. Called by a person or the door, never by the frame itself. */
  navigate(path: string): void
  /** Reload the app page. Called by a person or the door. */
  reload(): void
  /** Called after every change of address, attempt or load. */
  subscribe(listener: () => void): () => void
  /** The door's page window id of the canvas page, when its script has published one. */
  pageWindow(): string | undefined
}

/** The canvas as the frame renders it; one instance per client plugin lifetime. */
export class AppCanvasState implements AppCanvas {
  private addressValue: string | undefined
  private attemptValue = 0
  private loadedValue: AppCanvasView['loaded']
  private frame: HTMLIFrameElement | undefined
  private snapshot: AppCanvasView = Object.freeze({ address: undefined, attempt: 0, loaded: undefined })
  private readonly listeners = new Set<() => void>()

  /** Set once, from the Host's answer: the app's own page. */
  setAddress(address: string | undefined): void {
    this.addressValue = address
    this.emit()
  }

  address(): string | undefined {
    return this.addressValue
  }

  navigate(path: string): void {
    let next: string
    try {
      next = new URL(path, window.location.origin).href
    } catch {
      return
    }
    // A new address is a new frame; the same address is a reload, and still a new frame (the frame is never re-pointed).
    if (next !== this.addressValue) this.addressValue = next
    this.attemptValue += 1
    this.emit()
  }

  /**
   * Load the app page again where it is now. A link clicked inside the app, or the door's `act navigate` run in the page, moves the page without
   * passing here, so the address this state holds can be an earlier page: reloading that would take the person (or the agent) back to it after
   * every change of the app's code. The page's own address is read from the live frame (an app page is on the frame's origin, so it is readable);
   * a page that cannot be read, or one on another origin, reloads at the address held here.
   */
  reload(): void {
    if (this.addressValue === undefined) return
    const here = this.livePageAddress()
    if (here !== undefined) this.addressValue = here
    this.attemptValue += 1
    this.emit()
  }

  attempt(): number {
    return this.attemptValue
  }

  /** The component hands its frame over, so `pageWindow` reads the live page. */
  attach(frame: HTMLIFrameElement | null): void {
    this.frame = frame ?? undefined
  }

  /** The component reports a load; subscribers see the address it was for. */
  reportLoad(address: string, readable: boolean): void {
    this.loadedValue = Object.freeze({ address, readable })
    this.emit()
  }

  pageWindow(): string | undefined {
    const view = this.frame?.contentWindow as
      | (Window & { [DOOR_PAGE_KEY]?: { readonly windowId?: unknown } })
      | null
      | undefined
    const published = view?.[DOOR_PAGE_KEY]
    return typeof published?.windowId === 'string' ? published.windowId : undefined
  }

  /** The address the live frame shows, when it is an http(s) page on the origin of the address held here; undefined otherwise. */
  private livePageAddress(): string | undefined {
    if (this.addressValue === undefined) return undefined
    try {
      const href = this.frame?.contentWindow?.location.href
      if (href === undefined) return undefined
      const live = new URL(href)
      if (live.protocol !== 'http:' && live.protocol !== 'https:') return undefined
      return live.origin === new URL(this.addressValue).origin ? live.href : undefined
    } catch {
      // A page on another origin throws on `location.href`: keep the address held here.
      return undefined
    }
  }

  /** The live app page's window, when the canvas has one: the frame's view contract reaches the page through it. */
  contentWindow(): Window | undefined {
    return this.frame?.contentWindow ?? undefined
  }

  /** The identity `useSyncExternalStore` compares. */
  getSnapshot(): AppCanvasView {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    this.snapshot = Object.freeze({
      address: this.addressValue,
      attempt: this.attemptValue,
      loaded: this.loadedValue,
    })
    for (const listener of [...this.listeners]) listener()
  }
}
