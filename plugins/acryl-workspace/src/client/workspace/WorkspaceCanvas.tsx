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
import type { AgentBridge } from './agent-bridge.ts'
import { buildReviewComment } from './comment-message.ts'
import type { WorkspaceGitApi } from './git-api.ts'
import { GitDiffPane } from './GitDiffPane.tsx'
import type { ReviewStore } from './review-store.ts'
import { SplitDivider } from './SplitDivider.tsx'
import { clampSplit, readSplitRatio, writeSplitRatio } from './split-ratio.ts'
import { GLOBAL_GROUP, type WorkspaceGroups } from './groups.ts'
import type { WorkspaceShellState } from './shell-state.ts'
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
  /** Shared shell state: which worktree is selected, and the channel for open-diff requests. */
  readonly shell: WorkspaceShellState
  /** One tab workspace per worktree. Owned by the plugin so it can be saved and restored. */
  readonly groups: WorkspaceGroups
  readonly gitApi: WorkspaceGitApi
  /** Delivers diff line comments to the open chat's agent. */
  readonly agent: AgentBridge
  /** Remembers each comment sent, for the Review tab. */
  readonly review: ReviewStore
  /** Opens and closes the right panel. Always available, even for a chat that has no header yet. */
  readonly rightPanel?: { toggle(): void }
}

/**
 * Tab workspace that replaces the advanced-mode conversation surface with a tile-based canvas:
 * Chat/Terminal/File/Browser (ported from the reference `acryl-development-canvas` plugin) plus
 * Diff/Kanban/Doc (new, spec 040).
 * @param props.renderConversation - upstream Chat slot, rendered by the Chat tile.
 */
export function WorkspaceCanvas({ renderConversation, ptyApi, useSessions, shell, groups, gitApi, agent, review, rightPanel }: WorkspaceCanvasProps) {
  // One tab workspace per selected worktree: picking a branch swaps the whole set of tabs, and the
  // tabs of the branch you left (terminals, agents) keep running until they are closed.
  // Subscribe to primitives, not the whole shell snapshot: git polling updates that snapshot often,
  // and re-rendering the canvas re-renders the chat conversation inside it.
  const subscribeShell = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const groupKey = useSyncExternalStore(subscribeShell, () => shell.getSnapshot().selectedPath ?? GLOBAL_GROUP)
  const groupBranch = useSyncExternalStore(subscribeShell, () => shell.selectedWorktree()?.branch ?? null)
  const workspace = groups.stateFor(groupKey)
  const api = useMemo(() => ptyApi ?? createWorkspacePtyApi(), [ptyApi])
  const subscribe = useCallback((listener: () => void) => workspace.subscribe(listener), [workspace])
  const snapshot = useSyncExternalStore(subscribe, () => workspace.getSnapshot())
  const sessions = useSessions(state => state)
  const previousCurrent = useRef<string | undefined>(sessions.current)
  const menuRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState(() => readSplitRatio(safeStorage()))
  const changeSplitRatio = useCallback((ratio: number): void => {
    const next = clampSplit(ratio)
    setSplitRatio(next)
    writeSplitRatio(safeStorage(), next)
  }, [])
  const active = snapshot.tiles.find(tile => tile.id === snapshot.activeId)
  const splitTile = snapshot.tiles.find(tile => tile.id === snapshot.splitId)

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

  useEffect(() => shell.onOpenDiff((request) => {
    const state = groups.stateFor(request.worktree)
    const current = state.getSnapshot()
    // From the chat, open the diff beside it so the conversation stays visible.
    const fromChat = current.tiles.find(tile => tile.id === current.activeId)?.kind === 'chat'
    state.openDiff(request.worktree, request.file, { beside: fromChat })
  }), [shell, groups])

  // A check run from the Checks tab: a terminal tab in that worktree that types the command for you.
  useEffect(() => shell.onRunCheck((request) => {
    const state = groups.stateFor(request.worktree)
    const tile = state.addTile('pty', { commandId: 'shell', title: request.title })
    if (tile === undefined) return
    void (async () => {
      try {
        const view = await api.start('shell', request.worktree)
        state.updateTile(tile.id, { sessionId: view.id })
        await api.write(view.id, `${request.commandLine}\r`)
      } catch (cause) {
        state.updateTile(tile.id, { error: cause instanceof Error ? cause.message : 'spawn failed' })
      }
    })()
  }), [shell, groups, api])

  /** The pane for one tile, used for both the primary pane and the split pane. */
  const renderTile = (tile: WorkspaceTile): ReactNode => {
    if (tile.kind === 'chat') return <div className="dshWorkspaceChat">{renderConversation()}</div>
    if (tile.kind === 'pty') return <PtyPane tile={tile} api={api} />
    if (tile.kind === 'file') return <FilePane tile={tile} workspace={workspace} />
    if (tile.kind === 'browser') return <BrowserPane tile={tile} workspace={workspace} />
    if (tile.kind === 'kanban') return <KanbanPane tile={tile} workspace={workspace} />
    if (tile.kind === 'doc') return <DocPane tile={tile} workspace={workspace} />
    if (tile.diffFile !== undefined) {
      return (
        <GitDiffPane
          tile={tile}
          shell={shell}
          gitApi={gitApi}
          sendComment={async (input) => {
            const result = await agent.sendToCurrentSession(buildReviewComment({ ...input, branch: groupBranch }))
            if (result.ok && tile.diffWorktree !== undefined) {
              review.add({ worktree: tile.diffWorktree, file: input.file, side: input.side, line: input.line, lineText: input.lineText, comment: input.comment })
            }
            return result
          }}
        />
      )
    }
    return <DiffPane tile={tile} workspace={workspace} />
  }

  const openPty = useCallback(async (commandId: WorkspacePtyCommandId, title: string) => {
    const tile = workspace.addTile('pty', { commandId, title })
    if (tile === undefined) return
    try {
      // Terminals and agents start in the selected worktree, so each branch works in its own checkout.
      const view = await api.start(commandId, groupKey === GLOBAL_GROUP ? undefined : groupKey)
      workspace.updateTile(tile.id, { sessionId: view.id })
    } catch (cause) {
      workspace.updateTile(tile.id, {
        error: cause instanceof Error ? cause.message : 'spawn failed',
      })
    }
  }, [api, workspace, groupKey])

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
        {groupKey !== GLOBAL_GROUP && (
          <div className="dshWorkspaceGroup" title={groupKey} data-tab-group={groupKey}>
            <span aria-hidden="true">⎇</span> {groupBranch ?? 'detached'}
          </div>
        )}
        <div className="dshWorkspaceTabs">
          {snapshot.tiles.map((tile) => {
            const selected = tile.id === snapshot.activeId
            return (
              <div
                key={tile.id}
                className="dshWorkspaceTab"
                data-active={selected || undefined}
                data-split={tile.id === snapshot.splitId || undefined}
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
                {snapshot.tiles.length > 1 && !selected && (
                  <button
                    type="button"
                    className="dshWorkspaceTabSplit"
                    aria-label={tile.id === snapshot.splitId ? 'Close split' : `Open ${tile.title} beside the current tab`}
                    title={tile.id === snapshot.splitId ? 'Close the split' : 'Open beside the current tab'}
                    onClick={() => { if (tile.id === snapshot.splitId) workspace.closeSplit(); else workspace.openInSplit(tile.id) }}
                  >
                    ◫
                  </button>
                )}
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
        {rightPanel !== undefined && (
          <button
            type="button"
            className="dshWorkspaceRightToggle"
            aria-label="Toggle right panel"
            title="Show or hide the right panel (files, changes)"
            onClick={() => { rightPanel.toggle() }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <rect x="1.7" y="2.7" width="12.6" height="10.6" rx="2" />
              <path d="M10 2.9v10.2" />
            </svg>
          </button>
        )}
      </div>
      <div ref={stageRef} className="dshWorkspaceStage" role="tabpanel" data-split={splitTile !== undefined || undefined}>
        <div className="dshWorkspacePane" data-pane="primary" style={splitTile === undefined ? undefined : { flexBasis: `${splitRatio * 100}%`, flexGrow: 0 }}>
          {active === undefined
            ? (
                <div className="dshWorkspaceEmpty">
                  Press + to open a terminal, file, browser, diff, board, doc, or coding agent.
                </div>
              )
            : renderTile(active)}
        </div>
        {splitTile !== undefined && <SplitDivider stage={stageRef} ratio={splitRatio} onRatio={changeSplitRatio} />}
        {splitTile !== undefined && (
          <div className="dshWorkspacePane" data-pane="split">
            <div className="dshWorkspaceSplitHead">
              <span className="dshWorkspaceSplitTitle">
                <span aria-hidden="true">{glyph(splitTile.kind)}</span> {splitTile.title}
              </span>
              <button
                type="button"
                className="dshWorkspaceSplitClose"
                aria-label="Close split"
                title="Close the split (the tab stays open)"
                onClick={() => { workspace.closeSplit() }}
              >
                ×
              </button>
            </div>
            {renderTile(splitTile)}
          </div>
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

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
