/** Advanced-mode ADE workspace: one tab fills the main content area. */

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { CanvasPtyCommandId } from '../../canvas-pty-contract.ts'
import {
  CANVAS_AGENT_COMMANDS,
  CANVAS_SURFACE_ACTIONS,
  labelForCommand,
} from './agent-commands.ts'
import { createCanvasPtyApi, type CanvasPtyApi } from './pty-api.ts'
import { synchronizeCanvasWithSessionNavigation } from './session-navigation.ts'
import {
  DevelopmentCanvasState,
  normalizeBrowserUrl,
  type CanvasTile,
} from './state.ts'

export type DevelopmentCanvasProps = PropsRuntime<'root'> & {
  readonly renderConversation: () => ReactNode
  readonly ptyApi?: CanvasPtyApi
}

/**
 * Orca-style tab workspace that replaces the advanced-mode conversation surface.
 * @param props.renderConversation - upstream Chat slot, rendered by the Chat tab.
 */
export function DevelopmentCanvas({ renderConversation, ptyApi, useSessions }: DevelopmentCanvasProps) {
  const canvas = useMemo(() => new DevelopmentCanvasState(), [])
  const api = useMemo(() => ptyApi ?? createCanvasPtyApi(), [ptyApi])
  const subscribe = useCallback((listener: () => void) => canvas.subscribe(listener), [canvas])
  const snapshot = useSyncExternalStore(subscribe, () => canvas.getSnapshot())
  const sessions = useSessions(state => state)
  const previousCurrent = useRef<string | undefined>(sessions.current)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = snapshot.tiles.find(tile => tile.id === snapshot.activeId)

  useLayoutEffect(() => {
    const current = sessions.current
    previousCurrent.current = synchronizeCanvasWithSessionNavigation(
      canvas,
      previousCurrent.current,
      {
        current,
        blank: current === undefined ? undefined : sessions.byId[current]?.blank,
      },
    )
  }, [canvas, sessions])

  const closeTile = useCallback(async (tile: CanvasTile) => {
    const removed = canvas.closeTile(tile.id)
    if (removed?.sessionId !== undefined) {
      await api.close(removed.sessionId).catch(() => {})
    }
  }, [api, canvas])

  const openPty = useCallback(async (commandId: CanvasPtyCommandId, title: string) => {
    const tile = canvas.addTile('pty', { commandId, title })
    if (tile === undefined) return
    try {
      const view = await api.start(commandId)
      canvas.updateTile(tile.id, { sessionId: view.id })
    } catch (cause) {
      canvas.updateTile(tile.id, {
        error: cause instanceof Error ? cause.message : 'spawn failed',
      })
    }
  }, [api, canvas])

  useEffect(() => {
    if (!snapshot.menuOpen) return
    const onPointer = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node) !== true) {
        canvas.setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') canvas.setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [canvas, snapshot.menuOpen])

  return (
    <div className="dshCanvas" data-development-canvas="true" data-canvas-mode="tabs">
      <div className="dshCanvasTabstrip" role="tablist" aria-label="Development Canvas">
        <div className="dshCanvasTabs">
          {snapshot.tiles.map((tile) => {
            const selected = tile.id === snapshot.activeId
            return (
              <div
                key={tile.id}
                className="dshCanvasTab"
                data-active={selected || undefined}
                data-tile-kind={tile.kind}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="dshCanvasTabButton"
                  onClick={() => { canvas.selectTile(tile.id) }}
                >
                  <span className="dshCanvasTabGlyph" aria-hidden="true">{glyph(tile.kind)}</span>
                  <span className="dshCanvasTabLabel">{tile.title}</span>
                </button>
                <button
                  type="button"
                  className="dshCanvasTabClose"
                  aria-label={`Close ${tile.title}`}
                  onClick={() => { void closeTile(tile) }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <div className="dshCanvasPlusWrap" ref={menuRef}>
          <button
            type="button"
            className="dshCanvasPlus"
            aria-label="New tab"
            aria-expanded={snapshot.menuOpen}
            aria-haspopup="menu"
            onClick={() => { canvas.setMenuOpen(!snapshot.menuOpen) }}
          >
            +
          </button>
          {snapshot.menuOpen && (
            <div className="dshCanvasMenu" role="menu">
              {CANVAS_SURFACE_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="dshCanvasMenuItem"
                  onClick={() => {
                    if (action.kind === 'pty') {
                      void openPty(action.commandId ?? 'shell', labelForCommand(action.commandId ?? 'shell'))
                      return
                    }
                    canvas.addTile(action.kind)
                  }}
                >
                  {action.label}
                </button>
              ))}
              <div className="dshCanvasMenuRule" />
              {CANVAS_AGENT_COMMANDS.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  role="menuitem"
                  className="dshCanvasMenuItem"
                  onClick={() => { void openPty(command.id, command.label) }}
                >
                  {command.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="dshCanvasStage" role="tabpanel">
        {active === undefined && (
          <div className="dshCanvasEmpty">
            Press + to open a terminal, file, browser, or coding agent.
          </div>
        )}
        {active?.kind === 'chat' && (
          <div className="dshCanvasChat">{renderConversation()}</div>
        )}
        {active?.kind === 'pty' && (
          <PtyPane tile={active} api={api} />
        )}
        {active?.kind === 'file' && (
          <FilePane tile={active} canvas={canvas} />
        )}
        {active?.kind === 'browser' && (
          <BrowserPane tile={active} canvas={canvas} />
        )}
      </div>
    </div>
  )
}

function glyph(kind: CanvasTile['kind']): string {
  if (kind === 'chat') return '◎'
  if (kind === 'pty') return '❯'
  if (kind === 'file') return '▤'
  return '◉'
}

function PtyPane({
  tile,
  api,
}: {
  tile: CanvasTile
  api: CanvasPtyApi
}) {
  const [status, setStatus] = useState(tile.sessionId === undefined ? 'starting' : 'running')
  const terminalHost = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sessionId = tile.sessionId
    const host = terminalHost.current
    if (sessionId === undefined || host === null) {
      setStatus(tile.error === undefined ? 'starting' : 'error')
      return
    }

    const terminal = new XtermTerminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5_000,
      theme: {
        background: '#0b0d12',
        foreground: '#d7e0ea',
        cursor: '#d7e0ea',
        selectionBackground: '#334155',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminal.focus()

    let cancelled = false
    let rendered = ''
    let dimensions = ''
    const resize = (): void => {
      if (cancelled || host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      const next = `${String(terminal.cols)}x${String(terminal.rows)}`
      if (dimensions === next) return
      dimensions = next
      void api.resize(sessionId, terminal.cols, terminal.rows).catch(() => { setStatus('error') })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const animationFrame = requestAnimationFrame(resize)

    const input = terminal.onData((data) => {
      void api.write(sessionId, data).catch(() => { setStatus('error') })
    })
    const tick = async (): Promise<void> => {
      try {
        const view = await api.read(sessionId)
        if (cancelled) return
        if (!view.output.startsWith(rendered)) {
          terminal.reset()
          rendered = ''
        }
        const delta = view.output.slice(rendered.length)
        if (delta.length > 0) terminal.write(delta)
        rendered = view.output
        setStatus(view.status)
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 100)
    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      window.clearInterval(timer)
      observer.disconnect()
      input.dispose()
      terminal.dispose()
    }
  }, [api, tile.error, tile.sessionId])

  return (
    <div className="dshCanvasPty">
      <div className="dshCanvasPtyToolbar">
        <span className="dshCanvasPtyName">{tile.title}</span>
        <span className="dshCanvasPtyStatus">{status}</span>
      </div>
      <div ref={terminalHost} className="dshCanvasXterm" aria-label={`${tile.title} terminal`} />
      {tile.error !== undefined && <div className="dshCanvasPtyError">{tile.error}</div>}
    </div>
  )
}

function FilePane({
  tile,
  canvas,
}: {
  tile: CanvasTile
  canvas: DevelopmentCanvasState
}) {
  return (
    <div className="dshCanvasFile">
      <input
        aria-label="File path"
        placeholder="/absolute/or/workspace/path.ts"
        value={tile.path ?? ''}
        onChange={(event) => { canvas.updateTile(tile.id, { path: event.target.value }) }}
      />
      <textarea
        aria-label="File editor"
        spellCheck={false}
        value={tile.content ?? ''}
        onChange={(event) => { canvas.updateTile(tile.id, { content: event.target.value }) }}
      />
    </div>
  )
}

function BrowserPane({
  tile,
  canvas,
}: {
  tile: CanvasTile
  canvas: DevelopmentCanvasState
}) {
  const [draft, setDraft] = useState(tile.url ?? '')
  const href = tile.url ?? ''
  return (
    <div className="dshCanvasBrowser">
      <form
        className="dshCanvasBrowserBar"
        onSubmit={(event) => {
          event.preventDefault()
          const next = normalizeBrowserUrl(draft)
          if (next !== undefined) canvas.updateTile(tile.id, { url: next })
        }}
      >
        <input
          aria-label="Browser address"
          value={draft}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button type="submit">Go</button>
      </form>
      {href.length > 0 && (
        <iframe
          className="dshCanvasBrowserFrame"
          title="Browser tab"
          src={href}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      )}
    </div>
  )
}
