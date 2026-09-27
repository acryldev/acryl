/**
 * One terminal that outlives its tab.
 *
 * The xterm instance and its live stream belong to the session, not to the pane that shows it. Switching
 * tabs only moves the terminal's element out of and back into the page, so the screen is exactly as the
 * process left it: no replayed history, no redraw glitches. The session ends when its tab is closed.
 */

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import { enableGpuRenderer } from './gpu-renderer.ts'
import { findLinks } from './terminal-links.ts'
import { findMatches, isSearchShortcut, stepMatch, type TerminalMatch } from './terminal-search.ts'
import { PtyStream, type PtyStreamState, type StreamSocketFactory } from './pty-stream.ts'

export type TerminalStatus = PtyStreamState

export interface TerminalSessionSnapshot {
  readonly status: TerminalStatus
  readonly exitCode: number | null
  readonly error: string | null
}

const FONT_FAMILY = '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

export interface TerminalSessionOptions {
  /** Called once when the process behind a session ends. */
  readonly onExit?: (terminalId: string, exitCode: number | null) => void
  /** Called once when the Host no longer knows the terminal (it restarted, or the terminal was closed elsewhere). */
  readonly onLost?: (terminalId: string) => void
  /** Called when the program sets the terminal's title (`ESC ] 0 ; title BEL`). */
  readonly onTitle?: (terminalId: string, title: string) => void
  readonly createSocket?: StreamSocketFactory
  readonly urlFor?: (id: string, cursor: number) => string
}

export class TerminalSession {
  private readonly terminal: XtermTerminal
  private readonly fit = new FitAddon()
  private readonly stream: PtyStream
  private readonly element: HTMLDivElement
  private readonly listeners = new Set<() => void>()
  private snapshot: TerminalSessionSnapshot = { status: 'connecting', exitCode: null, error: null }
  private opened = false
  private host: HTMLElement | undefined
  private observer: ResizeObserver | undefined
  private frame: number | undefined
  private dims = ''
  private disposed = false
  private matches: readonly TerminalMatch[] = []
  private matchIndex = -1
  private searchQuery = ''
  private readonly searchListeners = new Set<() => void>()

  constructor(readonly id: string, options: TerminalSessionOptions = {}) {
    this.element = document.createElement('div')
    this.element.className = 'dshWorkspaceXtermScreen'
    // The fit addon measures this element's parent chain; without an explicit size it would fit the content.
    this.element.style.width = '100%'
    this.element.style.height = '100%'
    this.terminal = new XtermTerminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      // 1.0 keeps box-drawing lines continuous between rows, which every TUI relies on.
      lineHeight: 1,
      scrollback: 10_000,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
      theme: {
        background: '#0b0d12',
        foreground: '#d7e0ea',
        cursor: '#d7e0ea',
        selectionBackground: '#334155',
      },
    })
    this.terminal.loadAddon(this.fit)
    this.stream = new PtyStream(id, {
      output: (data, replace) => {
        if (replace) this.terminal.reset()
        this.terminal.write(data)
      },
      state: (status) => { this.update({ status }); if (status === 'lost') options.onLost?.(id) },
      exit: (exitCode, error) => { this.update({ exitCode, error }); options.onExit?.(id, exitCode) },
    }, options.createSocket, options.urlFor)
    this.terminal.onData((data) => { this.stream.input(data) })
    this.terminal.onTitleChange((title) => { options.onTitle?.(id, title) })
    // A web address in the output can be opened with a click (never anything but http and https).
    this.terminal.registerLinkProvider({
      provideLinks: (row, callback) => {
        const text = this.terminal.buffer.active.getLine(row - 1)?.translateToString(true) ?? ''
        const links = findLinks(text)
        callback(links.length === 0 ? undefined : links.map(link => ({
          range: { start: { x: link.start + 1, y: row }, end: { x: link.end, y: row } },
          text: link.url,
          activate: () => { window.open(link.url, '_blank', 'noopener,noreferrer') },
        })))
      },
    })
    const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
    this.terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && isSearchShortcut(event, mac)) {
        for (const listener of [...this.searchListeners]) listener()
        return false
      }
      return true
    })
    this.stream.connect()
  }

  getSnapshot = (): TerminalSessionSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Show this terminal in `host` (a pane), replacing whatever showed it before. */
  attach(host: HTMLElement): void {
    if (this.disposed) return
    this.detach()
    this.host = host
    host.appendChild(this.element)
    if (!this.opened) {
      this.opened = true
      this.terminal.open(this.element)
      enableGpuRenderer(this.terminal)
    }
    this.observer = new ResizeObserver(() => { this.scheduleFit() })
    this.observer.observe(host)
    this.scheduleFit()
    this.terminal.focus()
  }

  /** Take the terminal out of the page; it keeps running and keeps its screen. */
  detach(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.observer?.disconnect()
    this.observer = undefined
    if (this.element.parentElement === this.host) this.element.remove()
    this.host = undefined
  }

  focus(): void {
    this.terminal.focus()
  }

  /** Be told when the user asks to search this terminal (the search shortcut). @returns disposer. */
  onSearchRequest(listener: () => void): () => void {
    this.searchListeners.add(listener)
    return () => { this.searchListeners.delete(listener) }
  }

  /**
   * Select the next (or previous) occurrence of `query` in the scrollback and scroll it into view.
   * A new query starts from the top of what is on screen's nearest match after the current one.
   * @returns the position (1-based) and the number of matches; position 0 when there is none.
   */
  search(query: string, direction: 1 | -1 = 1): { readonly position: number; readonly total: number } {
    if (query !== this.searchQuery) {
      this.searchQuery = query
      const buffer = this.terminal.buffer.active
      const lines: string[] = []
      for (let row = 0; row < buffer.length; row += 1) lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
      this.matches = findMatches(lines, query)
      this.matchIndex = -1
    }
    this.matchIndex = stepMatch(this.matches.length, this.matchIndex, direction)
    const match = this.matches[this.matchIndex]
    if (match === undefined) {
      this.terminal.clearSelection()
      return { position: 0, total: 0 }
    }
    this.terminal.select(match.col, match.row, match.length)
    this.terminal.scrollToLine(Math.max(0, match.row - Math.floor(this.terminal.rows / 2)))
    return { position: this.matchIndex + 1, total: this.matches.length }
  }

  /** Forget the search (the bar closed): the selection goes and the next search starts fresh. */
  clearSearch(): void {
    this.searchQuery = ''
    this.matches = []
    this.matchIndex = -1
    this.terminal.clearSelection()
  }

  /** End the session's view of the process (the tab was closed); closing the process itself is the caller's. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.detach()
    this.stream.dispose()
    this.terminal.dispose()
    this.listeners.clear()
  }

  private scheduleFit(): void {
    this.frame ??= requestAnimationFrame(() => {
      this.frame = undefined
      const host = this.host
      if (this.disposed || host === undefined || host.clientWidth === 0 || host.clientHeight === 0) return
      this.fit.fit()
      const next = `${String(this.terminal.cols)}x${String(this.terminal.rows)}`
      if (next === this.dims) return
      this.dims = next
      this.stream.resize(this.terminal.cols, this.terminal.rows)
    })
  }

  private update(change: Partial<TerminalSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change }
    for (const listener of [...this.listeners]) listener()
  }
}

/** The live terminals of one workspace canvas, by Host session id. */
export class TerminalRegistry {
  private readonly sessions = new Map<string, TerminalSession>()

  private readonly lostListeners = new Set<(terminalId: string) => void>()
  private readonly exitListeners = new Set<(terminalId: string, exitCode: number | null) => void>()
  private readonly titleListeners = new Set<(terminalId: string, title: string) => void>()

  constructor(private readonly options: TerminalSessionOptions = {}) {}

  /** Be told when the Host no longer knows a terminal. @returns disposer. */
  onLost(listener: (terminalId: string) => void): () => void {
    this.lostListeners.add(listener)
    return () => { this.lostListeners.delete(listener) }
  }

  /** Be told when any session's process ends. @returns disposer. */
  onExit(listener: (terminalId: string, exitCode: number | null) => void): () => void {
    this.exitListeners.add(listener)
    return () => { this.exitListeners.delete(listener) }
  }

  /** Be told when a program sets its terminal's title. @returns disposer. */
  onTitle(listener: (terminalId: string, title: string) => void): () => void {
    this.titleListeners.add(listener)
    return () => { this.titleListeners.delete(listener) }
  }

  ensure(id: string): TerminalSession {
    let session = this.sessions.get(id)
    if (session === undefined) {
      session = new TerminalSession(id, {
        ...this.options,
        onLost: (terminalId) => {
          this.options.onLost?.(terminalId)
          for (const listener of [...this.lostListeners]) listener(terminalId)
        },
        onTitle: (terminalId, title) => {
          this.options.onTitle?.(terminalId, title)
          for (const listener of [...this.titleListeners]) listener(terminalId, title)
        },
        onExit: (terminalId, exitCode) => {
          this.options.onExit?.(terminalId, exitCode)
          for (const listener of [...this.exitListeners]) listener(terminalId, exitCode)
        },
      })
      this.sessions.set(id, session)
    }
    return session
  }

  /** The tab was closed: end the session's view. */
  release(id: string): void {
    this.sessions.get(id)?.dispose()
    this.sessions.delete(id)
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
  }
}
