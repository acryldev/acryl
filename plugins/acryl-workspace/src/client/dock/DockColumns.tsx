/**
 * Where the terminal panel sits. The frame renders its two columns through these, so the dock's three modes are
 * decided in one place:
 *
 * - {@link CenterColumn}: in `bottom` mode the panel sits under the main chat or canvas.
 * - {@link RightColumn}: in `stacked` mode the panel sits under the right pane's tabs; in `side` mode the right pane
 *   shows either the terminals or its own content at full height, with a two-icon switcher at the bottom.
 *
 * The right pane's own content (the upstream panel) is always rendered in the same place in the tree, and hidden
 * rather than removed when the terminals take its space, so it never remounts when the layout changes.
 */

import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { BOTTOM_MAX, BOTTOM_MIN, DEFAULT_DOCK_PREFS, STACKED_MAX, STACKED_MIN, clampBottomHeight, clampStackedRatio } from './dock-model.ts'
import { BranchIcon, TerminalIcon } from './dock-icons.tsx'
import { DockDivider } from './DockDivider.tsx'
import { useDockTarget, type DockHost } from './dock-host.ts'
import { TerminalDockPanel } from './TerminalDockPanel.tsx'

function usePrefs(host: DockHost) {
  return useSyncExternalStore(host.controller.subscribe, host.controller.getPrefs)
}

export function CenterColumn({ host, children }: { readonly host: DockHost; readonly children: ReactNode }) {
  const prefs = usePrefs(host)
  const target = useDockTarget(host)
  const column = useRef<HTMLDivElement>(null)
  const showing = prefs.open && prefs.mode === 'bottom'
  return (
    <div ref={column} className="dshDockCenter">
      <div className="dshDockCenterMain">{children}</div>
      {showing && (
        <>
          <DockDivider
            label="Resize the terminal panel"
            valueNow={prefs.bottomHeight}
            valueMin={BOTTOM_MIN}
            valueMax={BOTTOM_MAX}
            onDragTo={(clientY) => {
              const box = column.current?.getBoundingClientRect()
              if (box !== undefined) host.controller.setBottomHeight(clampBottomHeight(box.bottom - clientY))
            }}
            onStep={(direction) => { host.controller.setBottomHeight(prefs.bottomHeight - direction * 24) }}
            onReset={() => { host.controller.setBottomHeight(DEFAULT_DOCK_PREFS.bottomHeight) }}
          />
          <div className="dshDockBottom" style={{ height: prefs.bottomHeight }}>
            <TerminalDockPanel host={host} groupKey={target.groupKey} cwd={target.cwd} onHide={() => { host.controller.setOpen(false) }} />
          </div>
        </>
      )}
    </div>
  )
}

export function RightColumn({ host, rightbar }: { readonly host: DockHost; readonly rightbar: ReactNode }) {
  const prefs = usePrefs(host)
  const target = useDockTarget(host)
  const column = useRef<HTMLDivElement>(null)
  const stacked = prefs.open && prefs.mode === 'stacked'
  const side = prefs.open && prefs.mode === 'side'
  const terminalsFull = side && prefs.sideView === 'terminals'
  const panel = <TerminalDockPanel host={host} groupKey={target.groupKey} cwd={target.cwd} onHide={() => { host.controller.setOpen(false) }} />
  return (
    <div ref={column} className="dshDockRight">
      <div className="dshDockRightTop" hidden={terminalsFull} style={stacked ? { flex: `${String(1 - prefs.stackedRatio)} 1 0` } : undefined}>{rightbar}</div>
      {stacked && (
        <>
          <DockDivider
            label="Resize the terminal panel"
            valueNow={Math.round(prefs.stackedRatio * 100)}
            valueMin={Math.round(STACKED_MIN * 100)}
            valueMax={Math.round(STACKED_MAX * 100)}
            onDragTo={(clientY) => {
              const box = column.current?.getBoundingClientRect()
              if (box !== undefined && box.height > 0) host.controller.setStackedRatio(clampStackedRatio((box.bottom - clientY) / box.height))
            }}
            onStep={(direction) => { host.controller.setStackedRatio(prefs.stackedRatio - direction * 0.05) }}
            onReset={() => { host.controller.setStackedRatio(DEFAULT_DOCK_PREFS.stackedRatio) }}
          />
          <div className="dshDockRightBottom" style={{ flex: `${String(prefs.stackedRatio)} 1 0` }}>{panel}</div>
        </>
      )}
      {side && (
        <>
          {terminalsFull && <div className="dshDockRightBottom" style={{ flex: '1 1 0' }}>{panel}</div>}
          <div className="dshDockSwitcher" role="tablist" aria-label="Right pane">
            <button type="button" role="tab" aria-selected={!terminalsFull} aria-label="Show files and changes" title="Files and changes" onClick={() => { host.controller.setSideView('files') }}><BranchIcon /></button>
            <button type="button" role="tab" aria-selected={terminalsFull} aria-label="Show terminals" title="Terminals" onClick={() => { host.controller.setSideView('terminals') }}><TerminalIcon /></button>
          </div>
        </>
      )}
    </div>
  )
}
