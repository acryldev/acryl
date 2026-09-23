/** Advanced-mode ADE workspace: one tile fills the main content area. */

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
// `GlobalStandardProps.useSessions` (destructured below) is merged in by
// `dsh-client-ui-session`'s ambient `declare module` augmentation. Importing
// a real type from it (rather than an empty `import type {}`, which some
// compilations drop entirely) reliably pulls that augmentation into this
// program even though nothing here holds a value of it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { WorkspacePtyCommandId } from '../../workspace-pty-contract.ts'
import {
  WORKSPACE_AGENT_COMMANDS,
  WORKSPACE_SURFACE_ACTIONS,
  labelForCommand,
} from './agent-commands.ts'
import { diffLines } from './diff.ts'
import { parseDoc, parseInline } from './doc-format.ts'
import { createWorkspacePtyApi, type WorkspacePtyApi } from './pty-api.ts'
import { synchronizeWorkspaceWithSessionNavigation } from './session-navigation.ts'
import {
  WorkspaceState,
  normalizeBrowserUrl,
  type KanbanBoard,
  type KanbanColumnId,
  type WorkspaceTile,
} from './state.ts'

export type WorkspaceCanvasProps = Omit<PropsRuntime<'root'>, 'useSessions'> & {
  readonly renderConversation: () => ReactNode
  readonly ptyApi?: WorkspacePtyApi
  readonly useSessions: UseSessions
}

/**
 * Tab workspace that replaces the advanced-mode conversation surface with a tile-based canvas:
 * Chat/Terminal/File/Browser (ported from the reference `acryl-development-canvas` plugin) plus
 * Diff/Kanban/Doc (new, spec 040).
 * @param props.renderConversation - upstream Chat slot, rendered by the Chat tile.
 */
export function WorkspaceCanvas({ renderConversation, ptyApi, useSessions }: WorkspaceCanvasProps) {
  const workspace = useMemo(() => new WorkspaceState(), [])
  const api = useMemo(() => ptyApi ?? createWorkspacePtyApi(), [ptyApi])
  const subscribe = useCallback((listener: () => void) => workspace.subscribe(listener), [workspace])
  const snapshot = useSyncExternalStore(subscribe, () => workspace.getSnapshot())
  const sessions = useSessions(state => state)
  const previousCurrent = useRef<string | undefined>(sessions.current)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = snapshot.tiles.find(tile => tile.id === snapshot.activeId)

  useLayoutEffect(() => {
    const current = sessions.current
    previousCurrent.current = synchronizeWorkspaceWithSessionNavigation(
      workspace,
      previousCurrent.current,
      {
        current,
        blank: current === undefined ? undefined : sessions.byId[current]?.blank,
      },
    )
  }, [workspace, sessions])

  const closeTile = useCallback(async (tile: WorkspaceTile) => {
    const removed = workspace.closeTile(tile.id)
    if (removed?.sessionId !== undefined) {
      await api.close(removed.sessionId).catch(() => {})
    }
  }, [api, workspace])

  const openPty = useCallback(async (commandId: WorkspacePtyCommandId, title: string) => {
    const tile = workspace.addTile('pty', { commandId, title })
    if (tile === undefined) return
    try {
      const view = await api.start(commandId)
      workspace.updateTile(tile.id, { sessionId: view.id })
    } catch (cause) {
      workspace.updateTile(tile.id, {
        error: cause instanceof Error ? cause.message : 'spawn failed',
      })
    }
  }, [api, workspace])

  useEffect(() => {
    if (!snapshot.menuOpen) return
    const onPointer = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node) !== true) {
        workspace.setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') workspace.setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [workspace, snapshot.menuOpen])

  return (
    <div className="dshWorkspace" data-acryl-workspace="true" data-workspace-mode="tabs">
      <div className="dshWorkspaceTabstrip" role="tablist" aria-label="ACRYL Workspace">
        <div className="dshWorkspaceTabs">
          {snapshot.tiles.map((tile) => {
            const selected = tile.id === snapshot.activeId
            return (
              <div
                key={tile.id}
                className="dshWorkspaceTab"
                data-active={selected || undefined}
                data-tile-kind={tile.kind}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="dshWorkspaceTabButton"
                  onClick={() => { workspace.selectTile(tile.id) }}
                >
                  <span className="dshWorkspaceTabGlyph" aria-hidden="true">{glyph(tile.kind)}</span>
                  <span className="dshWorkspaceTabLabel">{tile.title}</span>
                </button>
                <button
                  type="button"
                  className="dshWorkspaceTabClose"
                  aria-label={`Close ${tile.title}`}
                  onClick={() => { void closeTile(tile) }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <div className="dshWorkspacePlusWrap" ref={menuRef}>
          <button
            type="button"
            className="dshWorkspacePlus"
            aria-label="New tab"
            aria-expanded={snapshot.menuOpen}
            aria-haspopup="menu"
            onClick={() => { workspace.setMenuOpen(!snapshot.menuOpen) }}
          >
            +
          </button>
          {snapshot.menuOpen && (
            <div className="dshWorkspaceMenu" role="menu">
              {WORKSPACE_SURFACE_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="dshWorkspaceMenuItem"
                  onClick={() => {
                    if (action.kind === 'pty') {
                      void openPty(action.commandId ?? 'shell', labelForCommand(action.commandId ?? 'shell'))
                      return
                    }
                    workspace.addTile(action.kind)
                  }}
                >
                  {action.label}
                </button>
              ))}
              <div className="dshWorkspaceMenuRule" />
              {WORKSPACE_AGENT_COMMANDS.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  role="menuitem"
                  className="dshWorkspaceMenuItem"
                  onClick={() => { void openPty(command.id, command.label) }}
                >
                  {command.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="dshWorkspaceStage" role="tabpanel">
        {active === undefined && (
          <div className="dshWorkspaceEmpty">
            Press + to open a terminal, file, browser, diff, board, doc, or coding agent.
          </div>
        )}
        {active?.kind === 'chat' && (
          <div className="dshWorkspaceChat">{renderConversation()}</div>
        )}
        {active?.kind === 'pty' && (
          <PtyPane tile={active} api={api} />
        )}
        {active?.kind === 'file' && (
          <FilePane tile={active} workspace={workspace} />
        )}
        {active?.kind === 'browser' && (
          <BrowserPane tile={active} workspace={workspace} />
        )}
        {active?.kind === 'diff' && (
          <DiffPane tile={active} workspace={workspace} />
        )}
        {active?.kind === 'kanban' && (
          <KanbanPane tile={active} workspace={workspace} />
        )}
        {active?.kind === 'doc' && (
          <DocPane tile={active} workspace={workspace} />
        )}
      </div>
    </div>
  )
}

function glyph(kind: WorkspaceTile['kind']): string {
  if (kind === 'chat') return '◎'
  if (kind === 'pty') return '❯'
  if (kind === 'file') return '▤'
  if (kind === 'diff') return '±'
  if (kind === 'kanban') return '▦'
  if (kind === 'doc') return '▧'
  return '◉'
}

function PtyPane({
  tile,
  api,
}: {
  tile: WorkspaceTile
  api: WorkspacePtyApi
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
    <div className="dshWorkspacePty">
      <div className="dshWorkspacePtyToolbar">
        <span className="dshWorkspacePtyName">{tile.title}</span>
        <span className="dshWorkspacePtyStatus">{status}</span>
      </div>
      <div ref={terminalHost} className="dshWorkspaceXterm" aria-label={`${tile.title} terminal`} />
      {tile.error !== undefined && <div className="dshWorkspacePtyError">{tile.error}</div>}
    </div>
  )
}

function FilePane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  return (
    <div className="dshWorkspaceFile">
      <input
        aria-label="File path"
        placeholder="/absolute/or/workspace/path.ts"
        value={tile.path ?? ''}
        onChange={(event) => { workspace.updateTile(tile.id, { path: event.target.value }) }}
      />
      <textarea
        aria-label="File editor"
        spellCheck={false}
        value={tile.content ?? ''}
        onChange={(event) => { workspace.updateTile(tile.id, { content: event.target.value }) }}
      />
    </div>
  )
}

function BrowserPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const [draft, setDraft] = useState(tile.url ?? '')
  const href = tile.url ?? ''
  return (
    <div className="dshWorkspaceBrowser">
      <form
        className="dshWorkspaceBrowserBar"
        onSubmit={(event) => {
          event.preventDefault()
          const next = normalizeBrowserUrl(draft)
          if (next !== undefined) workspace.updateTile(tile.id, { url: next })
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
          className="dshWorkspaceBrowserFrame"
          title="Browser tab"
          src={href}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      )}
    </div>
  )
}

/** Two-pane text-in, unified-diff-out view (spec 040's own dependency-free diff, `diff.ts`). */
function DiffPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const before = tile.diffBefore ?? ''
  const after = tile.diffAfter ?? ''
  const lines = useMemo(() => diffLines(before, after), [before, after])
  return (
    <div className="dshWorkspaceDiff">
      <div className="dshWorkspaceDiffInputs">
        <textarea
          aria-label="Before"
          placeholder="Before"
          spellCheck={false}
          value={before}
          onChange={(event) => { workspace.updateTile(tile.id, { diffBefore: event.target.value }) }}
        />
        <textarea
          aria-label="After"
          placeholder="After"
          spellCheck={false}
          value={after}
          onChange={(event) => { workspace.updateTile(tile.id, { diffAfter: event.target.value }) }}
        />
      </div>
      <div className="dshWorkspaceDiffOutput" aria-label="Diff result">
        {lines.map((line, index) => (
          // eslint-disable-next-line react/no-array-index-key -- diff lines have no stable identity
          <div key={index} className="dshWorkspaceDiffLine" data-diff-kind={line.kind}>
            <span className="dshWorkspaceDiffMarker">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
            <span className="dshWorkspaceDiffText">{line.text.length === 0 ? ' ' : line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const KANBAN_COLUMNS: readonly { readonly id: KanbanColumnId, readonly label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
]

/** A real, locally-interactive kanban board: add cards, move them between columns. */
function KanbanPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const board: KanbanBoard = tile.board ?? { todo: [], doing: [], done: [] }
  const [drafts, setDrafts] = useState<Record<KanbanColumnId, string>>({ todo: '', doing: '', done: '' })
  const [dragging, setDragging] = useState<string | undefined>(undefined)

  return (
    <div className="dshWorkspaceKanban">
      {KANBAN_COLUMNS.map((column) => (
        <div
          key={column.id}
          className="dshWorkspaceKanbanColumn"
          onDragOver={(event) => { event.preventDefault() }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragging === undefined) return
            workspace.moveCard(tile.id, dragging, column.id, board[column.id].length)
            setDragging(undefined)
          }}
        >
          <div className="dshWorkspaceKanbanColumnTitle">{column.label}</div>
          <div className="dshWorkspaceKanbanCards">
            {board[column.id].map(card => (
              <div
                key={card.id}
                className="dshWorkspaceKanbanCard"
                draggable
                onDragStart={() => { setDragging(card.id) }}
                onDragEnd={() => { setDragging(undefined) }}
              >
                {card.text}
              </div>
            ))}
          </div>
          <form
            className="dshWorkspaceKanbanAdd"
            onSubmit={(event) => {
              event.preventDefault()
              workspace.addCard(tile.id, column.id, drafts[column.id])
              setDrafts(previous => ({ ...previous, [column.id]: '' }))
            }}
          >
            <input
              aria-label={`Add card to ${column.label}`}
              placeholder="Add card…"
              value={drafts[column.id]}
              onChange={(event) => {
                const value = event.target.value
                setDrafts(previous => ({ ...previous, [column.id]: value }))
              }}
            />
          </form>
        </div>
      ))}
    </div>
  )
}

/** Split editor/preview doc tile using the dependency-free `doc-format.ts` renderer. */
function DocPane({
  tile,
  workspace,
}: {
  tile: WorkspaceTile
  workspace: WorkspaceState
}) {
  const text = tile.docText ?? ''
  const blocks = useMemo(() => parseDoc(text), [text])
  return (
    <div className="dshWorkspaceDoc">
      <textarea
        aria-label="Doc source"
        className="dshWorkspaceDocEditor"
        spellCheck={false}
        placeholder="# Heading&#10;&#10;- bullet&#10;- **bold** and *italic*"
        value={text}
        onChange={(event) => { workspace.updateTile(tile.id, { docText: event.target.value }) }}
      />
      <div className="dshWorkspaceDocPreview" aria-label="Doc preview">
        {blocks.map((block, index) => (
          // eslint-disable-next-line react/no-array-index-key -- blocks have no stable identity
          <DocBlockView key={index} block={block} />
        ))}
      </div>
    </div>
  )
}

function DocBlockView({ block }: { block: ReturnType<typeof parseDoc>[number] }) {
  if (block.kind === 'heading') {
    const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
    return <Tag className="dshWorkspaceDocHeading">{parseInline(block.text).map(inlineNode)}</Tag>
  }
  if (block.kind === 'bullet') {
    return (
      <ul className="dshWorkspaceDocList">
        {block.items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key -- items have no stable identity
          <li key={index}>{parseInline(item).map(inlineNode)}</li>
        ))}
      </ul>
    )
  }
  return <p className="dshWorkspaceDocParagraph">{parseInline(block.text).map(inlineNode)}</p>
}

function inlineNode(segment: { text: string, bold: boolean, italic: boolean }, index: number): ReactNode {
  let node: ReactNode = segment.text
  if (segment.bold) node = <strong>{node}</strong>
  if (segment.italic) node = <em>{node}</em>
  // eslint-disable-next-line react/no-array-index-key -- inline segments have no stable identity
  return <span key={index}>{node}</span>
}
