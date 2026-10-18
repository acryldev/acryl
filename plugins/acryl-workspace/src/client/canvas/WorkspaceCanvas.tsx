/** Advanced-mode ADE workspace: one tile fills the main content area. */

import type { PropsRuntime, UseSessions } from '@acryl/ui/frame'
// `GlobalStandardProps.useSessions` (destructured below) is merged in by
// `dsh-client-ui-session`'s ambient `declare module` augmentation. Importing
// a real type from it (rather than an empty `import type {}`, which some
// compilations drop entirely) reliably pulls that augmentation into this
// program even though nothing here holds a value of it.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { AgentId } from '../../pty/contract.ts'
import { TextDiffPane } from '../diff/TextDiffPane.tsx'
import type { AgentBridge } from '../sessions/agent-bridge.ts'
import { buildReviewComment } from '../diff/comment-message.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import { SessionBoardPane } from '../board/SessionBoardPane.tsx'
import type { ChatSelection } from '../chat/chat-selection.ts'
import { FileEditorPane } from '../files/FileEditorPane.tsx'
import type { WorkspaceFilesApi } from '../files/files-api.ts'
import { GitDiffPane } from '../diff/GitDiffPane.tsx'
import type { ReviewStore } from '../review/review-store.ts'
import type { CommentStore } from '../comments/comment-store.ts'
import { countRunning, runningLabel } from '../sessions/running-agents.ts'
import { estimateTerminalSize } from '../terminal/terminal-size.ts'
import { PtyPane } from '../terminal/PtyPane.tsx'
import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import { shouldRaiseSystemNotice, type SystemNoticePort } from '../notifications/system-notice.ts'
import { Toasts } from '../notifications/Toasts.tsx'
import { describeFinish, type ToastState, type ToastTarget } from '../notifications/toast-state.ts'
import { StatusLine } from '../chrome/StatusLine.tsx'
import { buildStatusLine } from '../chrome/status-line.ts'
import type { AgentsState } from '../agents/agents-state.ts'
import { TabStrip } from '../tabs/TabStrip.tsx'
import { SplitDivider } from './SplitDivider.tsx'
import { routeShellRequests } from './shell-requests.ts'
import { clampSplit, readSplitRatio, writeSplitRatio } from './split-ratio.ts'
import { GLOBAL_GROUP, groupLocation, type WorkspaceGroups } from './groups.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { DocFilePane } from '../docs/DocFilePane.tsx'
import { DocPane } from '../docs/DocPane.tsx'
import { openSettingsSection } from '../settings/open-settings.ts'
import { CustomTabPane } from '../tabs/registry/CustomTabPane.tsx'
import type { WorkspaceTabRegistry } from '../tabs/registry/tab-registry.ts'
import type { AgentStatusState } from '../status/agent-status-state.ts'
import type { DockController } from '../dock/dock-controller.ts'
import type { RightPaneHandle } from '../dock/DockButtons.tsx'
import { CommandPalette } from '../palette/CommandPalette.tsx'
import type { PaletteConfigState } from '../palette/palette-config.ts'
import { useWorkspacePalette } from '../palette/use-workspace-palette.ts'
import type { TabTypesState } from '../tabs/tab-types-state.ts'
import { BrowserPane } from '../browser/BrowserPane.tsx'
import { ScratchFilePane } from '../files/ScratchFilePane.tsx'
import { createWorkspacePtyApi, type WorkspacePtyApi } from '../terminal/pty-api.ts'
import type { ProjectsControl } from '../projects/projects-control.ts'
import type { WorkspaceTile } from './state.ts'

export type WorkspaceCanvasProps = Omit<PropsRuntime<'root'>, 'useSessions'> & {
  readonly renderConversation: () => ReactNode
  readonly ptyApi?: WorkspacePtyApi
  /** The live terminals, owned by the composition root so they end with the plugin, not with a render. */
  readonly terminals: TerminalRegistry
  /** The user's custom agents, for the "+" menu and the tab icons. */
  readonly agents: AgentsState
  /** Which tab types are turned on (Settings > Tabs). */
  readonly tabTypes: TabTypesState
  /** The tab types plugins registered. */
  readonly tabRegistry: WorkspaceTabRegistry
  /** What the command palette lists (Settings > Command palette). */
  readonly paletteConfig: PaletteConfigState
  /** Notices such as "Claude finished", fed from the terminals' exits. */
  readonly toasts: ToastState
  /** Notices outside the page; permission is asked for by a button, never on load. */
  readonly notices: SystemNoticePort
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
  /** Which chat is shown: tab selection and the board's cards go through it. */
  readonly chats: ChatSelection
  /** Remembers each comment sent, for the Review tab. */
  readonly review: ReviewStore
  /** Line comments from files, kept until the user copies or sends them. */
  readonly comments: CommentStore
  /** Opens and closes the right panel. Always available, even for a chat that has no header yet. */
  readonly rightPanel?: RightPaneHandle
  /** The terminal dock: its buttons sit in the tab strip, and the frame places its panel. */
  readonly dock: DockController
  /** What terminal agents report (working, waiting for you, done). */
  readonly agentStatus: AgentStatusState
  /** Starts a brand new AcrylDSH Chat session in this worktree, for the "+" menu's own chat entry. */
  readonly projects: ProjectsControl
}

/**
 * Tab workspace that replaces the advanced-mode conversation surface with a tile-based canvas:
 * Chat/Terminal/File/Browser (ported from the reference `acryl-development-canvas` plugin) plus
 * Diff/Kanban/Doc (new, spec 040).
 * @param props.renderConversation - upstream Chat slot, rendered by the Chat tile.
 */
export function WorkspaceCanvas({ renderConversation, ptyApi, terminals, dock, agentStatus, agents: agentsState, tabTypes, tabRegistry, paletteConfig, toasts, notices, useSessions, shell, groups, gitApi, filesApi, agent, chats, review, comments, rightPanel, projects }: WorkspaceCanvasProps) {
  // One tab workspace per selected worktree: picking a branch swaps the whole set of tabs, and the
  // tabs of the branch you left (terminals, agents) keep running until they are closed.
  // Subscribe to primitives, not the whole shell snapshot: git polling updates that snapshot often,
  // and re-rendering the canvas re-renders the chat conversation inside it.
  const subscribeShell = useCallback((listener: () => void) => shell.subscribe(listener), [shell])
  const groupKey = useSyncExternalStore(subscribeShell, () => shell.getSnapshot().selectedPath ?? GLOBAL_GROUP)
  const groupBranch = useSyncExternalStore(subscribeShell, () => shell.selectedWorktree()?.branch ?? null)
  // Each workspace keeps its own tab set per worktree (spec 043): switching workspace swaps the set like switching worktree does.
  const subscribeGroups = useCallback((listener: () => void) => groups.onChange(listener), [groups])
  const shownWorkspace = useSyncExternalStore(subscribeGroups, () => groups.workspace())
  const workspace = useMemo(() => groups.stateFor(groupKey), [groups, groupKey, shownWorkspace])
  const api = useMemo(() => ptyApi ?? createWorkspacePtyApi(), [ptyApi])
  const subscribe = useCallback((listener: () => void) => workspace.subscribe(listener), [workspace])
  const snapshot = useSyncExternalStore(subscribe, () => workspace.getSnapshot())
  const sessions = useSessions(state => state)
  const stageRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState(() => readSplitRatio(safeStorage()))
  /** Set only when starting a new AcrylDSH Chat from the "+" menu fails (no tab exists yet to attach it to). */
  const [chatNotice, setChatNotice] = useState<string | null>(null)
  const changeSplitRatio = useCallback((ratio: number): void => {
    const next = clampSplit(ratio)
    setSplitRatio(next)
    writeSplitRatio(safeStorage(), next)
  }, [])
  const active = snapshot.tiles.find(tile => tile.id === snapshot.activeId)
  const splitTile = snapshot.tiles.find(tile => tile.id === snapshot.splitId)

  const renameChat = useCallback((sessionId: string, title: string) => {
    void projects.renameChat(sessionId, title).then((result) => { if (!result.ok) setChatNotice(result.reason) })
  }, [projects])

  const closeTile = useCallback(async (tile: WorkspaceTile) => {
    // Closing a chat's tab from the tab strip hides it from the tree too: one close
    // action, both surfaces, matching the tree's own hover "x" for the same session.
    if (tile.kind === 'chat' && tile.chatSessionId !== undefined) shell.dismissChat(tile.chatSessionId)
    const removed = workspace.closeTile(tile.id)
    if (removed?.terminalId !== undefined) {
      terminals.release(removed.terminalId)
      await api.close(removed.terminalId).catch(() => {})
    }
  }, [api, workspace, terminals, shell])

  // What the tree and the Changes, Files and Checks tabs ask of the tab sets (close a tab, open a diff, a file or a document, run a check).
  useEffect(() => routeShellRequests({ shell, groups, terminals, api }), [shell, groups, terminals, api])

  /** The pane for one tile, used for both the primary pane and the split pane. */
  const renderTile = (tile: WorkspaceTile): ReactNode => {
    if (tile.kind === 'chat') return <div className="dshWorkspaceChat">{renderConversation()}</div>
    if (tile.kind === 'pty') return <PtyPane tile={tile} terminals={terminals} />
    if (tile.kind === 'doc' && tile.docRel !== undefined) return <DocFilePane tile={tile} shell={shell} filesApi={filesApi} />
    if (tile.kind === 'file' && tile.fileRel !== undefined) return <FileEditorPane tile={tile} workspace={workspace} filesApi={filesApi} comments={comments} />
    if (tile.kind === 'file') return <ScratchFilePane tile={tile} workspace={workspace} />
    if (tile.kind === 'browser') return <BrowserPane tile={tile} workspace={workspace} />
    if (tile.kind === 'kanban') return <SessionBoardPane tile={tile} workspace={workspace} shell={shell} useSessions={useSessions} navigator={chats} />
    if (tile.kind === 'doc') return <DocPane tile={tile} workspace={workspace} />
    if (tile.kind === 'custom') return <CustomTabPane tile={tile} workspace={workspace} registry={tabRegistry} />
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
    return <TextDiffPane tile={tile} workspace={workspace} />
  }

  const openPty = useCallback(async (commandId: AgentId, title: string) => {
    const tile = workspace.addTile('pty', { commandId, title })
    if (tile === undefined) return
    try {
      // Terminals and agents start in the selected worktree, so each branch works in its own checkout.
      const stage = stageRef.current
      const size = stage === null ? undefined : estimateTerminalSize(stage.clientWidth, stage.clientHeight)
      const view = await api.start(commandId, groupKey === GLOBAL_GROUP ? undefined : groupKey, size)
      workspace.updateTile(tile.id, { terminalId: view.id })
    } catch (cause) {
      workspace.updateTile(tile.id, {
        error: cause instanceof Error ? cause.message : 'spawn failed',
      })
    }
  }, [api, workspace, groupKey])

  // A new AcrylDSH Chat from the "+" menu: a brand new session, opened in this worktree. Once it becomes
  // current, ChatSelection gives it its own tab - never the existing one.
  const openChat = useCallback(async () => {
    if (groupKey === GLOBAL_GROUP) { setChatNotice('Select a worktree first.'); return }
    setChatNotice(null)
    const result = await projects.newChat(groupKey)
    if (!result.ok) setChatNotice(result.reason)
  }, [projects, groupKey])

  const openTarget = useCallback((target: ToastTarget): void => {
    const show = (): void => {
      if (target.worktree !== GLOBAL_GROUP) shell.select(target.worktree)
      chats.selectTab(target.worktree, target.tabId)
    }
    // A tab in another workspace: show that workspace first.
    if (target.workspace === groups.workspace()) { show(); return }
    void projects.switchWorkspace(target.workspace).then((result) => { if (result.ok) show() })
  }, [shell, chats, groups, projects])
  const [noticePermission, setNoticePermission] = useState(() => notices.permission())

  // Every open agent tab keeps its stream (also in a worktree that is not shown), and an agent that
  // ends raises a notice that leads back to its tab.
  useEffect(() => {
    const ensureAll = (): void => {
      for (const [, state] of groups.entries()) {
        for (const tile of state.getSnapshot().tiles) {
          if (tile.kind === 'pty' && tile.terminalId !== undefined) terminals.ensure(tile.terminalId)
        }
      }
    }
    ensureAll()
    const stopGroups = groups.onChange(ensureAll)
    const stopExit = terminals.onExit((terminalId, exitCode) => {
      for (const [key, state] of groups.entries()) {
        const tile = state.getSnapshot().tiles.find(candidate => candidate.terminalId === terminalId)
        if (tile === undefined) continue
        if (tile.commandId !== undefined && tile.commandId !== 'shell') {
          const text = describeFinish(tile.title, exitCode)
          const target = { ...groupLocation(key), tabId: tile.id }
          toasts.push(text, target)
          if (shouldRaiseSystemNotice(notices)) notices.show('ACRYL', text, () => { openTarget(target) })
        }
        return
      }
    })
    // A terminal the Host no longer has (the Host restarted since this tab was saved) closes its tab.
    const stopLost = terminals.onLost((terminalId) => {
      for (const [, state] of groups.entries()) {
        const tile = state.getSnapshot().tiles.find(candidate => candidate.terminalId === terminalId)
        if (tile === undefined) continue
        state.closeTile(tile.id)
        terminals.release(terminalId)
        return
      }
    })
    // A shell that sets its title (the directory, the running command) names its tab, unless the user renamed it.
    const stopTitle = terminals.onTitle((terminalId, title) => {
      for (const [, state] of groups.entries()) {
        if (state.applyTerminalTitle(terminalId, title)) return
      }
    })
    // An agent that starts needing you (a permission, a question) raises a notice that leads to its tab.
    const stopNeeds = agentStatus.onNeedsYou((terminalId) => {
      for (const [key, state] of groups.entries()) {
        const tile = state.getSnapshot().tiles.find(candidate => candidate.terminalId === terminalId)
        if (tile === undefined) continue
        const text = `${tile.title} needs you`
        const target = { ...groupLocation(key), tabId: tile.id }
        toasts.push(text, target)
        if (shouldRaiseSystemNotice(notices)) notices.show('ACRYL', text, () => { openTarget(target) })
        return
      }
    })
    return () => { stopGroups(); stopExit(); stopLost(); stopTitle(); stopNeeds() }
  }, [groups, terminals, toasts, notices, agentStatus])

  const customAgents = useSyncExternalStore(agentsState.subscribe, agentsState.getSnapshot)
  const agentSettings = useSyncExternalStore(agentsState.subscribe, agentsState.getSettings)
  // Primitives only, so git polling that changes nothing here does not re-render the canvas.
  const changedFiles = useSyncExternalStore(subscribeShell, () => shell.selectedWorktree()?.changes.length ?? 0)
  const addedLines = useSyncExternalStore(subscribeShell, () => shell.selectedWorktree()?.added ?? 0)
  const removedLines = useSyncExternalStore(subscribeShell, () => shell.selectedWorktree()?.removed ?? 0)
  const statusSegments = buildStatusLine({
    branch: groupKey === GLOBAL_GROUP ? undefined : groupBranch,
    changedFiles,
    added: addedLines,
    removed: removedLines,
    runningAgents: countRunning(sessions.ids.flatMap((id) => { const row = sessions.byId[id]; return row === undefined ? [] : [row] })),
    terminals: snapshot.tiles.filter(tile => tile.kind === 'pty').length,
  })
  const palette = useWorkspacePalette({
    workspace, groups, groupKey, snapshot, shell, gitApi, toasts, agentSettings, customAgents, tabTypes, tabRegistry, dock, config: paletteConfig, rightPanel,
    openPty: (commandId, title) => { void openPty(commandId, title) },
    selectTab: (tileId) => { chats.selectTab(groupKey, tileId) },
    closeTile: (tileId) => { const tile = snapshot.tiles.find(candidate => candidate.id === tileId); if (tile !== undefined) void closeTile(tile) },
  })
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
        dock={dock}
        agentStatus={agentStatus}
        chatAvailable={projects.chatAvailable}
        storage={safeStorage()}
        onSelect={(tile) => { chats.selectTab(groupKey, tile.id) }}
        onClose={(tile) => { void closeTile(tile) }}
        customAgents={customAgents}
        terminals={terminals}
        onOpenPty={(commandId, title) => { void openPty(commandId, title) }}
        onOpenChat={() => { void openChat() }}
        onRenameChat={renameChat}
        agentSettings={agentSettings}
        tabTypes={tabTypes}
        tabRegistry={tabRegistry}
        onSetAgentEnabled={(id, enabled) => agentsState.change({ agent: { id, enabled } })}
        onManageSettings={(section, onSettled) => openSettingsSection(section, document, undefined, onSettled)}
      />
      {chatNotice !== null && (
        <p className="dshWorkspaceSideNotice" role="alert">{chatNotice}</p>
      )}
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
      <StatusLine
        segments={statusSegments}
        {...(noticePermission === 'default'
          ? { action: { label: 'Enable notifications', title: 'Get a system notice when an agent finishes while you are in another app', run: () => { void notices.request().then(setNoticePermission) } } }
          : {})}
      />
      <CommandPalette palette={palette} />
      <Toasts
        state={toasts}
        onOpen={openTarget}
      />
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

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
