/**
 * The workspace's tab strip: the branch, the tabs (each with an icon, renamable in place, scrollable when
 * there are many), the running-agents pill, the "+" menu with its configurable agent list, and the
 * right-panel toggle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentId } from '../../pty/contract.ts'
import type { WorkspaceSnapshot, WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import { labelForCommand } from '../terminal/agent-commands.ts'
import { AgentIcon } from './AgentIcon.tsx'
import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import { NewTabMenu } from './NewTabMenu.tsx'
import { TabActivity } from './TabActivity.tsx'
import { tabsToClose } from './tab-close.ts'
import { hiddenEdges, scrollToReveal, wheelToScroll } from './tab-scroll.ts'

export interface TabStripProps {
  readonly snapshot: WorkspaceSnapshot
  readonly workspace: WorkspaceState
  /** The selected worktree's path, or the global group key when none is selected. */
  readonly branchLabel: string | null
  readonly branchTitle: string
  readonly runningText: string | null
  readonly rightPanel?: { toggle(): void }
  readonly storage: Storage | undefined
  onClose(tile: WorkspaceTile): void
  readonly customAgents: readonly CustomAgent[]
  /** The live terminals, for the activity marker on agent tabs. */
  readonly terminals: TerminalRegistry
  onOpenPty(commandId: AgentId, title: string): void
  onAddAgent(agent: CustomAgent): Promise<void>
  onRemoveAgent(id: string): Promise<void>
}

interface TabContextMenuProps {
  readonly x: number
  readonly y: number
  readonly tiles: readonly WorkspaceTile[]
  readonly anchorId: string
  readonly splitId: string | undefined
  onClose(): void
  onRename(id: string): void
  onCloseTab(tile: WorkspaceTile): void
  onOpenBeside(id: string): void
  onCloseSplit(): void
}

function TabContextMenu({ x, y, tiles, anchorId, splitId, onClose, onRename, onCloseTab, onOpenBeside, onCloseSplit }: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (event: PointerEvent): void => { if (ref.current?.contains(event.target as Node) !== true) onClose() }
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [onClose])
  const ids = tiles.map(tile => tile.id)
  const closing = (scope: 'others' | 'right'): void => {
    for (const id of tabsToClose(ids, anchorId, scope)) {
      const tile = tiles.find(candidate => candidate.id === id)
      if (tile !== undefined) onCloseTab(tile)
    }
  }
  const anchor = tiles.find(tile => tile.id === anchorId)
  const item = (label: string, run: () => void, disabled = false) => (
    <button type="button" role="menuitem" className="dshWorkspaceMenuItem" disabled={disabled} onClick={() => { run(); onClose() }}>{label}</button>
  )
  return (
    <div ref={ref} className="dshWorkspaceMenu dshWorkspaceTabMenu" role="menu" aria-label="Tab actions" style={{ position: 'fixed', top: y, left: x, right: 'auto' }}>
      {item('Rename', () => { onRename(anchorId) })}
      {tiles.length > 1 && (anchorId === splitId
        ? item('Close split', onCloseSplit)
        : item('Open beside the current tab', () => { onOpenBeside(anchorId) }))}
      <div className="dshWorkspaceMenuRule" />
      {anchor !== undefined && item('Close', () => { onCloseTab(anchor) })}
      {item('Close others', () => { closing('others') }, tiles.length < 2)}
      {item('Close to the right', () => { closing('right') }, tabsToClose(ids, anchorId, 'right').length === 0)}
    </div>
  )
}

function kindGlyph(kind: WorkspaceTile['kind']): string {
  if (kind === 'chat') return '◎'
  if (kind === 'pty') return '❯'
  if (kind === 'file') return '▤'
  if (kind === 'diff') return '±'
  if (kind === 'kanban') return '▦'
  if (kind === 'doc') return '▧'
  return '◉'
}

export function TabStrip({ snapshot, workspace, branchLabel, branchTitle, runningText, rightPanel, storage, customAgents, terminals, onClose, onOpenPty, onAddAgent, onRemoveAgent }: TabStripProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  const [tabMenu, setTabMenu] = useState<{ readonly id: string; readonly x: number; readonly y: number } | null>(null)
  const [editing, setEditing] = useState<{ readonly id: string; readonly value: string } | null>(null)

  const syncEdges = useCallback((): void => {
    const el = tabsRef.current
    if (el === null) return
    const next = hiddenEdges({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })
    setEdges(previous => (previous.start === next.start && previous.end === next.end ? previous : next))
  }, [])

  // A vertical wheel scrolls the strip sideways; React's onWheel is passive, so this listener is native.
  useEffect(() => {
    const el = tabsRef.current
    if (el === null) return
    const onWheel = (event: WheelEvent): void => {
      const by = wheelToScroll(event.deltaX, event.deltaY)
      if (by === null || el.scrollWidth <= el.clientWidth) return
      event.preventDefault()
      el.scrollLeft += by
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(syncEdges)
    observer.observe(el)
    return () => { el.removeEventListener('wheel', onWheel); observer.disconnect() }
  }, [syncEdges])

  // The active tab (also a newly opened one) is always brought into view.
  useEffect(() => {
    const el = tabsRef.current
    const tab = el?.querySelector<HTMLElement>('[data-tab-id][data-active]')
    if (el === null || el === undefined || tab === null || tab === undefined) return
    const to = scrollToReveal({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }, tab.offsetLeft, tab.offsetWidth)
    if (to !== null) el.scrollLeft = to
    syncEdges()
  }, [snapshot.activeId, snapshot.tiles.length, syncEdges])

  const commitRename = (): void => {
    if (editing === null) return
    workspace.renameTile(editing.id, editing.value)
    setEditing(null)
  }

  return (
    <div className="dshWorkspaceTabstrip" role="tablist" aria-label="ACRYL Workspace">
      {branchLabel !== null && (
        <div className="dshWorkspaceGroup" title={branchTitle} data-tab-group={branchTitle}>
          <span aria-hidden="true">⎇</span> {branchLabel}
        </div>
      )}
      <div className="dshWorkspaceTabs" ref={tabsRef} onScroll={syncEdges} data-more-start={edges.start || undefined} data-more-end={edges.end || undefined}>
        {snapshot.tiles.map((tile) => {
          const selected = tile.id === snapshot.activeId
          const renaming = editing?.id === tile.id
          return (
            <div
              key={tile.id}
              className="dshWorkspaceTab"
              data-active={selected || undefined}
              data-split={tile.id === snapshot.splitId || undefined}
              data-tile-kind={tile.kind}
              data-tab-id={tile.id}
              onContextMenu={(event) => { event.preventDefault(); setTabMenu({ id: tile.id, x: event.clientX, y: event.clientY }) }}
            >
              {renaming ? (
                <form className="dshWorkspaceTabButton" onSubmit={(event) => { event.preventDefault(); commitRename() }}>
                  <input
                    className="dshWorkspaceTabRename"
                    aria-label={`Rename ${tile.title}`}
                    autoFocus
                    value={editing.value}
                    onFocus={(event) => { event.currentTarget.select() }}
                    onChange={(event) => { setEditing({ id: tile.id, value: event.target.value }) }}
                    onBlur={commitRename}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null) } }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="dshWorkspaceTabButton"
                  title={`${tile.title} (double-click to rename)`}
                  onClick={() => { workspace.selectTile(tile.id) }}
                  onDoubleClick={() => { setEditing({ id: tile.id, value: tile.title }) }}
                  onKeyDown={(event) => { if (event.key === 'F2') { event.preventDefault(); setEditing({ id: tile.id, value: tile.title }) } }}
                >
                  <span className="dshWorkspaceTabGlyph" aria-hidden="true">
                    {tile.kind === 'pty' ? <AgentIcon commandId={tile.commandId ?? 'shell'} custom={customAgents.find(agent => agent.id === tile.commandId)?.badge} /> : kindGlyph(tile.kind)}
                  </span>
                  {tile.kind === 'pty' && tile.commandId !== undefined && tile.commandId !== 'shell' && (
                    <TabActivity session={tile.terminalId === undefined ? undefined : terminals.ensure(tile.terminalId)} />
                  )}
                  <span className="dshWorkspaceTabLabel">{tile.title}{tile.fileRel !== undefined && tile.content !== undefined ? ' ●' : ''}</span>
                </button>
              )}
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
              <button type="button" className="dshWorkspaceTabClose" aria-label={`Close ${tile.title}`} onClick={() => { onClose(tile) }}>×</button>
            </div>
          )
        })}
      </div>
      {runningText !== null && (
        <button
          type="button"
          className="dshWorkspaceRunning"
          title="Open the live board"
          onClick={() => {
            const board = snapshot.tiles.find(tile => tile.kind === 'kanban')
            if (board !== undefined) workspace.selectTile(board.id)
            else workspace.addTile('kanban')
          }}
        >
          <span className="dshWorkspaceRunningDot" aria-hidden="true" />
          {runningText}
        </button>
      )}
      <NewTabMenu
        open={snapshot.menuOpen}
        customAgents={customAgents}
        storage={storage}
        setOpen={(open) => { workspace.setMenuOpen(open) }}
        onSurface={(action) => {
          if (action.kind === 'pty') onOpenPty(action.commandId ?? 'shell', labelForCommand(action.commandId ?? 'shell'))
          else workspace.addTile(action.kind)
        }}
        onOpenAgent={onOpenPty}
        onAddAgent={onAddAgent}
        onRemoveAgent={onRemoveAgent}
      />
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
      {tabMenu !== null && (
        <TabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          tiles={snapshot.tiles}
          anchorId={tabMenu.id}
          splitId={snapshot.splitId}
          onClose={() => { setTabMenu(null) }}
          onRename={(id) => { const tile = snapshot.tiles.find(candidate => candidate.id === id); if (tile !== undefined) setEditing({ id, value: tile.title }) }}
          onCloseTab={onClose}
          onOpenBeside={(id) => { workspace.openInSplit(id) }}
          onCloseSplit={() => { workspace.closeSplit() }}
        />
      )}
    </div>
  )
}
