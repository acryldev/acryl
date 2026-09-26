/** Advanced-mode ADE workspace: one tile fills the main content area. */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
// `GlobalStandardProps.useSessions` (destructured below) is merged in by
// `dsh-client-ui-session`'s ambient `declare module` augmentation. Importing
// a real type from it (rather than an empty `import type {}`, which some
// compilations drop entirely) reliably pulls that augmentation into this
// program even though nothing here holds a value of it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { WorkspacePtyCommandId } from '../../pty/contract.ts'
import { diffLines } from '../diff/line-diff.ts'
import type { AgentBridge } from '../sessions/agent-bridge.ts'
import { buildReviewComment } from '../diff/comment-message.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import { SessionBoardPane } from '../board/SessionBoardPane.tsx'
import type { SessionNavigator } from '../sessions/session-navigator.ts'
import { FileEditorPane } from '../files/FileEditorPane.tsx'
import type { WorkspaceFilesApi } from '../files/files-api.ts'
import { GitDiffPane } from '../diff/GitDiffPane.tsx'
import type { ReviewStore } from '../review/review-store.ts'
import { countRunning, runningLabel } from '../sessions/running-agents.ts'
import { PtyPane } from '../terminal/PtyPane.tsx'
import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import { TabStrip } from '../tabs/TabStrip.tsx'
import { SplitDivider } from './SplitDivider.tsx'
import { clampSplit, readSplitRatio, writeSplitRatio } from './split-ratio.ts'
import { GLOBAL_GROUP, type WorkspaceGroups } from './groups.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { DocFilePane } from '../docs/DocFilePane.tsx'
import { DocView } from '../docs/DocView.tsx'
import { parseDoc } from '../docs/doc-format.ts'
import { createWorkspacePtyApi, type WorkspacePtyApi } from '../terminal/pty-api.ts'
import { synchronizeWorkspaceWithSessionNavigation } from '../sessions/session-navigation.ts'
import {
  WorkspaceState,
  normalizeBrowserUrl,
  type WorkspaceTile,
} from './state.ts'

export type WorkspaceCanvasProps = Omit<PropsRuntime<'root'>, 'useSessions'> & {
  readonly renderConversation: () => ReactNode
  readonly ptyApi?: WorkspacePtyApi
  /** The live terminals, owned by the composition root so they end with the plugin, not with a render. */
  readonly terminals: TerminalRegistry
  readonly useSessions: UseSessions
  /** Shared shell state: which worktree is selected, and the channel for open-diff requests. */
  readonly shell: WorkspaceShellState
  /** One tab workspace per worktree. Owned by the plugin so it can be saved and restored. */
  readonly groups: WorkspaceGroups
  readonly gitApi: WorkspaceGitApi
  /** Reads and saves real files for the editor tabs. */
  readonly filesApi: WorkspaceFilesApi
  /** Delivers diff line comments to the open chat's agent. */
  readonly agent: AgentBridge
  /** Opens a chat by id, for the board's cards. */
  readonly sessionNavigator: SessionNavigator
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
export function WorkspaceCanvas({ renderConversation, ptyApi, terminals, useSessions, shell, groups, gitApi, filesApi, agent, sessionNavigator, review, rightPanel }: WorkspaceCanvasProps) {
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
      terminals.release(removed.sessionId)
      await api.close(removed.sessionId).catch(() => {})
    }
  }, [api, workspace, terminals])

  useEffect(() => shell.onOpenDiff((request) => {
    const state = groups.stateFor(request.worktree)
    const current = state.getSnapshot()
    // From the chat, open the diff beside it so the conversation stays visible.
    const fromChat = current.tiles.find(tile => tile.id === current.activeId)?.kind === 'chat'
    state.openDiff(request.worktree, request.file, { beside: fromChat })
  }), [shell, groups])

  useEffect(() => shell.onOpenFile((request) => {
    const state = groups.stateFor(request.worktree)
    const current = state.getSnapshot()
    // From the chat, open the file beside it so the conversation stays visible.
    const fromChat = current.tiles.find(tile => tile.id === current.activeId)?.kind === 'chat'
    state.openFile(request.worktree, request.file, { beside: fromChat })
  }), [shell, groups])

  useEffect(() => shell.onOpenDoc((request) => {
    const state = groups.stateFor(request.worktree)
    const current = state.getSnapshot()
    const fromChat = current.tiles.find(tile => tile.id === current.activeId)?.kind === 'chat'
    state.openDoc(request.worktree, request.file, { beside: fromChat })
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
    if (tile.kind === 'pty') return <PtyPane tile={tile} terminals={terminals} />
    if (tile.kind === 'doc' && tile.docRel !== undefined) return <DocFilePane tile={tile} shell={shell} filesApi={filesApi} />
    if (tile.kind === 'file' && tile.fileRel !== undefined) return <FileEditorPane tile={tile} workspace={workspace} filesApi={filesApi} />
    if (tile.kind === 'file') return <FilePane tile={tile} workspace={workspace} />
    if (tile.kind === 'browser') return <BrowserPane tile={tile} workspace={workspace} />
    if (tile.kind === 'kanban') return <SessionBoardPane tile={tile} workspace={workspace} shell={shell} useSessions={useSessions} navigator={sessionNavigator} />
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
              review.add({ worktree: tile.diffWorktree, file: input.file, side: input.side, line: input.line, ...(input.endLine === undefined ? {} : { endLine: input.endLine }), lineText: input.lineText, comment: input.comment })
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

  const runningText = runningLabel(countRunning(sessions.ids.flatMap((id) => { const row = sessions.byId[id]; return row === undefined ? [] : [row] })))

  return (
    <div className="dshWorkspace" data-acryl-workspace="true" data-workspace-mode="tabs">
      <TabStrip
        snapshot={snapshot}
        workspace={workspace}
        branchLabel={groupKey === GLOBAL_GROUP ? null : (groupBranch ?? 'detached')}
        branchTitle={groupKey}
        runningText={runningText}
        {...(rightPanel === undefined ? {} : { rightPanel })}
        storage={safeStorage()}
        onClose={(tile) => { void closeTile(tile) }}
        onOpenPty={(commandId, title) => { void openPty(commandId, title) }}
      />
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
        <DocView blocks={blocks} />
      </div>
    </div>
  )
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
