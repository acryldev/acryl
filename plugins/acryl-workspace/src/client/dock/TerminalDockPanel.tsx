/**
 * The terminal panel: a strip of terminal tabs (rename by double-click, close, and + for a new one) over the
 * active terminal. It follows the selected worktree, so each branch has its own terminals, and it starts a first
 * terminal by itself when it is opened empty.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { WorkspaceTile } from '../canvas/state.ts'
import { PtyPane } from '../terminal/PtyPane.tsx'
import { estimateTerminalSize } from '../terminal/terminal-size.ts'
import { ChevronDownIcon } from './dock-icons.tsx'
import type { DockHost } from './dock-host.ts'
import type { DockTab } from './dock-tabs.ts'

export interface TerminalDockPanelProps {
  readonly host: DockHost
  readonly groupKey: string
  /** The directory a new terminal starts in (the selected worktree). */
  readonly cwd: string | undefined
  /** Closes the panel (the terminals keep running). */
  onHide(): void
}

/** The dock's tab as the terminal pane wants it. */
function tileOf(tab: DockTab): WorkspaceTile {
  return { id: tab.id, kind: 'pty', title: tab.title, commandId: 'shell', ...(tab.terminalId === undefined ? {} : { terminalId: tab.terminalId }), ...(tab.error === undefined ? {} : { error: tab.error }) }
}

export function TerminalDockPanel({ host, groupKey, cwd, onHide }: TerminalDockPanelProps) {
  const state = host.controller.groups.stateFor(groupKey)
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot)
  const body = useRef<HTMLDivElement>(null)
  const started = useRef(new Set<string>())
  const [renaming, setRenaming] = useState<string | null>(null)
  const active = snapshot.tabs.find(tab => tab.id === snapshot.activeId)

  const start = (): void => {
    const element = body.current
    const size = element === null ? undefined : estimateTerminalSize(element.clientWidth, element.clientHeight)
    void host.controller.openTab(groupKey, cwd, size)
  }

  // Opened empty: start the first terminal. Closing the last tab afterwards does not start another.
  useEffect(() => {
    if (snapshot.tabs.length > 0 || started.current.has(groupKey)) return
    started.current.add(groupKey)
    start()
    // `start` reads only refs and stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, snapshot.tabs.length])

  return (
    <div className="dshDockPanel" data-dock-panel>
      <div className="dshDockTabs" role="tablist" aria-label="Terminals">
        {snapshot.tabs.map(tab => (
          <div key={tab.id} className="dshDockTab" data-active={tab.id === snapshot.activeId || undefined}>
            {renaming === tab.id
              ? (
                  <input
                    className="dshDockTabRename"
                    aria-label={`Rename ${tab.title}`}
                    defaultValue={tab.title}
                    autoFocus
                    onFocus={(event) => { event.currentTarget.select() }}
                    onBlur={(event) => { state.rename(tab.id, event.currentTarget.value); setRenaming(null) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      else if (event.key === 'Escape') setRenaming(null)
                    }}
                  />
                )
              : (
                  <button type="button" role="tab" aria-selected={tab.id === snapshot.activeId} className="dshDockTabButton" title="Double-click to rename" onClick={() => { state.select(tab.id) }} onDoubleClick={() => { setRenaming(tab.id) }}>
                    {tab.title}
                  </button>
                )}
            <button type="button" className="dshDockTabClose" aria-label={`Close ${tab.title}`} onClick={() => { void host.controller.closeTab(groupKey, tab.id) }}>×</button>
          </div>
        ))}
        <button type="button" className="dshDockAdd" aria-label="New terminal" title="New terminal" onClick={start}>+</button>
        <span className="dshDockGrow" />
        <button type="button" className="dshDockHide" aria-label="Hide the terminal panel" title="Hide the terminal panel (terminals keep running)" onClick={onHide}><ChevronDownIcon /></button>
      </div>
      <div ref={body} className="dshDockBody">
        {active === undefined
          ? <div className="dshDockEmpty">No terminal is open here. <button type="button" onClick={start}>Start one</button></div>
          : <PtyPane key={active.id} tile={tileOf(active)} terminals={host.terminals} compact />}
      </div>
    </div>
  )
}
