/**
 * The workspace's tab strip: the branch, the tabs (each with an icon, renamable in place, scrollable when
 * there are many), the running-agents pill, the "+" menu with its configurable agent list, and the
 * right-panel toggle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspacePtyCommandId } from '../../pty/contract.ts'
import type { WorkspaceSnapshot, WorkspaceState, WorkspaceTile } from '../canvas/state.ts'
import { labelForCommand, WORKSPACE_AGENT_COMMANDS, WORKSPACE_SURFACE_ACTIONS } from '../terminal/agent-commands.ts'
import { AgentIcon } from './AgentIcon.tsx'
import { readHiddenAgents, toggleAgent, visibleAgents, writeHiddenAgents } from './agent-visibility.ts'
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
  onOpenPty(commandId: WorkspacePtyCommandId, title: string): void
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

export function TabStrip({ snapshot, workspace, branchLabel, branchTitle, runningText, rightPanel, storage, onClose, onOpenPty }: TabStripProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  const [editing, setEditing] = useState<{ readonly id: string; readonly value: string } | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenAgents(storage))
  const [configuring, setConfiguring] = useState(false)

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

  // The menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!snapshot.menuOpen) return
    const onPointer = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node) !== true) {
        workspace.setMenuOpen(false)
        setConfiguring(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { workspace.setMenuOpen(false); setConfiguring(false) }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [workspace, snapshot.menuOpen])

  const commitRename = (): void => {
    if (editing === null) return
    workspace.renameTile(editing.id, editing.value)
    setEditing(null)
  }

  const flipAgent = (id: string): void => {
    const next = toggleAgent(hidden, id)
    setHidden(next)
    writeHiddenAgents(storage, next)
  }

  const closeMenu = (): void => { workspace.setMenuOpen(false); setConfiguring(false) }

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
                    {tile.kind === 'pty' ? <AgentIcon commandId={tile.commandId ?? 'shell'} /> : kindGlyph(tile.kind)}
                  </span>
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
      <div className="dshWorkspacePlusWrap" ref={menuRef}>
        <button
          type="button"
          className="dshWorkspacePlus"
          aria-label="New tab"
          aria-expanded={snapshot.menuOpen}
          aria-haspopup="menu"
          onClick={() => { workspace.setMenuOpen(!snapshot.menuOpen); setConfiguring(false) }}
        >
          +
        </button>
        {snapshot.menuOpen && !configuring && (
          <div className="dshWorkspaceMenu" role="menu">
            {WORKSPACE_SURFACE_ACTIONS.map(action => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className="dshWorkspaceMenuItem"
                onClick={() => {
                  if (action.kind === 'pty') onOpenPty(action.commandId ?? 'shell', labelForCommand(action.commandId ?? 'shell'))
                  else workspace.addTile(action.kind)
                  closeMenu()
                }}
              >
                {action.kind === 'pty' && <AgentIcon commandId="shell" />}
                {action.label}
              </button>
            ))}
            <div className="dshWorkspaceMenuRule" />
            {visibleAgents(WORKSPACE_AGENT_COMMANDS, hidden).map(command => (
              <button
                key={command.id}
                type="button"
                role="menuitem"
                className="dshWorkspaceMenuItem"
                onClick={() => { onOpenPty(command.id, command.label); closeMenu() }}
              >
                <AgentIcon commandId={command.id} />
                {command.label}
              </button>
            ))}
            <div className="dshWorkspaceMenuRule" />
            <button type="button" role="menuitem" className="dshWorkspaceMenuItem" data-muted onClick={() => { setConfiguring(true) }}>
              Configure agents...
            </button>
          </div>
        )}
        {snapshot.menuOpen && configuring && (
          <div className="dshWorkspaceMenu" role="menu" aria-label="Configure agents">
            <div className="dshWorkspaceMenuHint">Choose the agents the + menu lists.</div>
            {WORKSPACE_AGENT_COMMANDS.map(command => (
              <button
                key={command.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={!hidden.has(command.id)}
                className="dshWorkspaceMenuItem"
                onClick={() => { flipAgent(command.id) }}
              >
                <AgentIcon commandId={command.id} />
                <span className="dshWorkspaceMenuGrow">{command.label}</span>
                <span className="dshWorkspaceMenuCheck" aria-hidden="true">{hidden.has(command.id) ? '' : '✓'}</span>
              </button>
            ))}
            <div className="dshWorkspaceMenuRule" />
            <button type="button" role="menuitem" className="dshWorkspaceMenuItem" onClick={() => { setConfiguring(false) }}>Done</button>
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
  )
}
