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

  constructor(readonly id: string, options: TerminalSessionOptions = {}) {
    this.element = document.createElement('div')
    this.element.className = 'dshWorkspaceXtermScreen'
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

  ensure(id: string): TerminalSession {
    let session = this.sessions.get(id)
    if (session === undefined) {
      session = new TerminalSession(id, {
        ...this.options,
        onLost: (terminalId) => {
          this.options.onLost?.(terminalId)
          for (const listener of [...this.lostListeners]) listener(terminalId)
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
