/**
 * The Blends frame (docs/design/blends-frame-mockup.html): a top bar; on the left the branches with what is open on them, and the versions; the
 * app alone in the centre; on the right the agents as tabs. Nothing of the IDE's workbench is here - no projects, tab strip of tiles, dock or start
 * page. DSH renders only inside it: the chat is the keyed `main` entry `conversation` in the right panel, and a keyed panel DSH opens (Settings)
 * covers the frame as a dialog.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@acryl/ui/frame'
// The `sidebar.settings` seat's type: DSH's Settings shell occupies it, the frame renders it.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DesktopLayoutState } from 'acryl-app-shell/client'
import type { AppCanvasState } from './canvas/app-canvas.ts'
import { AppCanvas } from './canvas/AppCanvas.tsx'
import type { AppReloadStore } from './app-reload.ts'
import type { FrameStateStore } from './frame-state.ts'
import type { SelectedElement, SelectionStore } from './selection.ts'
import type { FrameViewState } from './view-state.ts'
import { LeftPanel, type BranchesPort, type ChatsPort, type FeedbackPort } from './LeftPanel.tsx'
import type { BranchChatsPort } from './branch-chats.ts'
import { savedLabel, type VersionsPort } from './versions.ts'
import type { GitSyncPort } from './git-sync.ts'
import { RightPanel, type SidebarPort } from './RightPanel.tsx'
import type { FrameTabs } from './tabs.ts'
import type { SwitchRequests } from './switch-request.ts'
import type { FrameTools } from './tools.ts'
import type { DesktopApp } from './desktop-app.ts'
import { clampPanelWidth, resolvePanelWidths, type PanelSide } from './panel-resize.ts'
import type { ThemeSwitch } from './theme-switch.ts'

export interface BlendsFrameInjected {
  readonly layout: DesktopLayoutState
  /** DSH's right sidebar, drawn in the right panel's Panel tab. */
  readonly sidebar: SidebarPort
  readonly canvas: AppCanvasState
  readonly selection: SelectionStore
  readonly frameState: FrameStateStore
  /** Whether the app's last code was refused (a syntax error): the bar says so while the canvas keeps the last good app. */
  readonly appReload: AppReloadStore
  readonly view: FrameViewState
  /** The Dark/Light switch in the top bar. */
  readonly themeSwitch: ThemeSwitch
  readonly chats: ChatsPort
  readonly versions: VersionsPort
  /** The Git tab's push and pull (the Host runs git). */
  readonly gitSync: GitSyncPort
  readonly tabs: FrameTabs
  readonly tools: FrameTools
  readonly feedback: FeedbackPort
  readonly branches: BranchesPort
  /** Which branch each chat was opened on (DSH keeps no branches; the Host records it). */
  readonly branchChats: BranchChatsPort
  /** A chat of another branch asked for from the chat's History: the left panel offers the switch. */
  readonly switchRequests: SwitchRequests
  /** A desktop product's app (`./desktop-app.ts`): the bar shows the name the person gave it. */
  readonly desktop?: DesktopApp
}

export type BlendsFrameProps = PropsRuntime<'root'> & PropsRenderSlots<'main' | 'rightbar' | 'shell.overlay' | 'sidebar.settings'> & BlendsFrameInjected

/** Outside a desktop product the bar names the app as its package does. */
const NO_DESKTOP: Pick<DesktopApp, 'getSnapshot' | 'subscribe'> = { getSnapshot: () => undefined, subscribe: () => () => {} }

function useStore<T>(store: { getSnapshot(): T; subscribe(listener: () => void): () => void }): T {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store])
  return useSyncExternalStore(subscribe, () => store.getSnapshot())
}

/** The frame fills the window; a window resize re-clamps the panels, so a shrunken window still leaves the app its 360px. */
const subscribeWindow = (listener: () => void): (() => void) => {
  window.addEventListener('resize', listener)
  return () => { window.removeEventListener('resize', listener) }
}

function useWindowWidth(): number {
  return useSyncExternalStore(subscribeWindow, () => window.innerWidth)
}

const PanelIcon = ({ side }: { side: 'left' | 'right' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d={side === 'left' ? 'M6 2.5v11' : 'M10 2.5v11'} />
  </svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="2.4" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" />
  </svg>
)

const SelectIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <circle cx="8" cy="8" r="4.5" />
    <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
  </svg>
)

export function BlendsFrame({ layout, sidebar, canvas, selection, frameState, appReload, view, themeSwitch, chats, versions, gitSync, tabs, tools, feedback, branches, branchChats, switchRequests, desktop, renderSlot }: BlendsFrameProps) {
  const state = useStore(frameState)
  const label = useStore(desktop ?? NO_DESKTOP)?.name
  const appError = useStore(appReload).error
  const frameView = useStore(view)
  const scheme = useStore(themeSwitch)
  const activePanelId = useSyncExternalStore(layout.panelInfo.subscribe, () => layout.panelInfo.getSnapshot().activePanelId)
  // DSH's right sidebar asks the layout to show it (a plan, a changes review); the right panel answers with its Panel tab.
  const details = useMemo(() => ({
    subscribe: (listener: () => void) => layout.subscribe(listener),
    getSnapshot: () => layout.getSnapshot().detailsShown,
  }), [layout])
  const [versionLabel, setVersionLabel] = useState<string | undefined>(undefined)
  // The select control belongs to the canvas, not to the app: it turns clicks into picks until a click, Escape, or Preview ends it.
  const [picking, setPicking] = useState(false)
  const windowWidth = useWindowWidth()
  const frameElement = useRef<HTMLDivElement | null>(null)
  const bodyElement = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (state.status === 'ready' && state.state.appPage !== undefined && canvas.address() === undefined) {
      canvas.setAddress(new URL(state.state.appPage, window.location.origin).href)
    }
  }, [state, canvas])

  // The checked-out branch: the right panel's strip shows its tabs, and a tab opened now belongs to it.
  useEffect(() => {
    if (state.status === 'ready') tabs.setBranch(state.state.branches.find(branch => branch.current)?.name)
  }, [state, tabs])

  // The switch the History asked for is the left panel's to offer: show the panel.
  const switchRequest = useStore(switchRequests)
  useEffect(() => { if (switchRequest !== undefined) view.showLeft() }, [switchRequest, view])

  const appName = label ?? (state.status === 'ready' ? state.state.appName : '')
  const saved = state.status === 'ready' ? savedLabel(state.state.unsaved) : undefined
  const barLabel = [versionLabel, saved].filter((part): part is string => part !== undefined).join(' · ')
  const preview = frameView.mode === 'preview'
  const selected = useStore(selection).selection
  // Preview is what users see: the frame's own controls, the select control among them, leave the picture.
  useEffect(() => { if (preview) setPicking(false) }, [preview])
  // A picked element is what the chat is about: show the chat and give its composer the keyboard.
  const pick = (element: SelectedElement): void => {
    setPicking(false)
    selection.select(element)
    const open = chats.getSnapshot().find(row => row.current)
    tabs.activate(open === undefined ? 'chat' : tabs.chatTabId(open.id))
    view.showRight()
  }
  const leftOpen = frameView.left && !preview
  const rightOpen = frameView.right && !preview
  // A keyed panel other than the conversation (one DSH or a plugin opens) is a page of its own: it covers the frame until closed.
  const dialogPanel = activePanelId !== null && activePanelId !== 'conversation' ? activePanelId : null
  // The widths the person gave the panels, clamped to the window as it is now; a closed panel shows 0 and keeps its own width for the reopen.
  const panelWidths = resolvePanelWidths(
    { left: frameView.leftWidth, right: frameView.rightWidth },
    { left: leftOpen, right: rightOpen },
    windowWidth,
  )
  // The inner border is the whole handle (owner, T009): nothing is drawn, no tooltip; the cursor says it. Dragging settles a width, a double-click
  // puts the default back. The width is written straight to the column while the pointer moves, so the drag follows without a render per event.
  const startResize = (side: PanelSide) => (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const body = bodyElement.current
    const frameNow = frameElement.current
    if (body === null || frameNow === null) return
    const grip = event.currentTarget
    event.preventDefault()
    grip.setPointerCapture(event.pointerId)
    const box = body.getBoundingClientRect()
    const other = side === 'left' ? panelWidths.right : panelWidths.left
    let width = side === 'left' ? panelWidths.left : panelWidths.right
    frameNow.dataset.resizing = side
    const move = (moveEvent: PointerEvent): void => {
      const want = side === 'left' ? moveEvent.clientX - box.left : box.right - moveEvent.clientX
      width = clampPanelWidth(want, box.width, other)
      frameNow.style.setProperty(side === 'left' ? '--bf-lw' : '--bf-rw', `${String(width)}px`)
    }
    const end = (): void => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', end)
      grip.removeEventListener('pointercancel', end)
      delete frameNow.dataset.resizing
      view.setWidth(side, width)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

  return (
    <div
      ref={frameElement}
      className="acrylBlendsFrame"
      style={{ '--bf-lw': `${String(panelWidths.left)}px`, '--bf-rw': `${String(panelWidths.right)}px` } as CSSProperties}
      data-mode={frameView.mode}
      data-left={leftOpen ? 'open' : 'closed'}
      data-right={rightOpen ? 'open' : 'closed'}
    >
      <header className="acrylBlendsBar">
        <button
          type="button"
          className="acrylBlendsIconButton"
          aria-pressed={leftOpen}
          aria-label="Left panel: branches and versions"
          title="Left panel: branches and versions"
          disabled={preview}
          onClick={() => { view.toggleLeft() }}
        >
          <PanelIcon side="left" />
        </button>
        <span className="acrylBlendsAppName">
          {appName}
          {barLabel !== '' && <small>{barLabel}</small>}
        </span>
        {appError !== undefined && (
          <span className="acrylBlendsAppError" role="alert" title={`The app keeps running its last working code: the new code was refused. ${appError}`}>
            Not reloaded: {appError}
          </span>
        )}
        <span className="acrylBlendsGrow" />
        {/* The select control sits in the frame's bar, never over the app: the canvas holds only the app. */}
        {!preview && (
          <button
            type="button"
            className="acrylBlendsSelectButton"
            aria-pressed={picking}
            aria-label="Select an element for the chat"
            title="Select an element for the chat"
            onClick={() => { setPicking(value => !value) }}
          >
            <SelectIcon /> Select
          </button>
        )}
        <div className="acrylBlendsModes" role="group" aria-label="Mode">
          <button type="button" aria-pressed={frameView.mode === 'build'} onClick={() => { view.setMode('build') }}>Build</button>
          <button type="button" aria-pressed={frameView.mode === 'preview'} onClick={() => { view.setMode('preview') }}>Preview</button>
        </div>
        {/* The icon is the scheme a click switches to: a sun while the frame is dark, a moon while it is light. */}
        <button
          type="button"
          className="acrylBlendsIconButton"
          aria-label={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => { themeSwitch.toggle() }}
        >
          {scheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {/* DSH's Settings: its slot draws the launcher (the gear, ./SettingsLauncher.tsx) and the modal it opens. */}
        <span className="acrylBlendsSettings">{renderSlot('sidebar.settings', { wide: false })}</span>
        <button
          type="button"
          className="acrylBlendsIconButton"
          aria-pressed={rightOpen}
          aria-label="Right panel: agents"
          title="Right panel: agents"
          disabled={preview}
          onClick={() => { view.toggleRight() }}
        >
          <PanelIcon side="right" />
        </button>
      </header>
      <div className="acrylBlendsBody" ref={bodyElement}>
        <aside className="acrylBlendsLeft" aria-label="Branches and versions" hidden={!leftOpen}>
          {state.status === 'ready' && (
            <LeftPanel
              state={state.state}
              readState={() => frameState.current()}
              chats={chats}
              versions={versions}
              tabs={tabs}
              feedback={feedback}
              branches={branches}
              branchChats={branchChats}
              switchRequests={switchRequests}
              showTab={(id) => {
                tabs.activate(id)
                view.showRight()
              }}
              onVersionLabel={setVersionLabel}
              gitSync={gitSync}
            />
          )}
          {state.status === 'error' && <p className="acrylBlendsNote" data-error>{state.message}</p>}
        </aside>
        <main className="acrylBlendsCanvas" aria-label="The app">
          {preview && (
            <div className="acrylBlendsBackbar">
              You are seeing what users see
              <button type="button" className="acrylBlendsSmallButton" onClick={() => { view.setMode('build') }}>Back to Build</button>
            </div>
          )}
          {!preview && picking && (
            <div className="acrylBlendsCanvasTools">
              <span className="acrylBlendsPickingHint" role="status">Click an element in the app. Esc cancels.</span>
            </div>
          )}
          <div className="acrylBlendsCanvasPage">
            <AppCanvas
              canvas={canvas}
              picking={picking && !preview}
              onPick={pick}
              onCancel={() => { setPicking(false) }}
              // The app left the page the pick was made on: the chip and the next message's context go with the page.
              onStaleSelection={() => { selection.clear() }}
              selected={preview ? undefined : selected}
            />
          </div>
        </main>
        <aside className="acrylBlendsRight" aria-label="Agents" hidden={!rightOpen}>
          <RightPanel
            chats={chats}
            tabs={tabs}
            tools={tools}
            versions={versions}
            gitSync={gitSync}
            state={state.status === 'ready' ? state.state : undefined}
            branchChats={branchChats}
            switchRequests={switchRequests}
            renderConversation={(): ReactNode => renderSlot('main', {}, { entryKey: 'conversation' })}
            // The panel is the right sidebar's whole room: its width, a viewport that is not a phone's, and room to show (DSH's own rule needs 300px).
            renderDetails={(width: number): ReactNode => renderSlot('rightbar', { width, viewportWidth: Math.max(window.innerWidth, 768), canShow: width >= 300 })}
            details={details}
            sidebar={sidebar}
          />
        </aside>
        {/* The inner borders, as grab areas: invisible, a few px over the border, the resize cursor on hover; double-click restores the default. */}
        <div
          className="acrylBlendsGrip acrylBlendsGripLeft"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the left panel"
          hidden={!leftOpen}
          onPointerDown={startResize('left')}
          onDoubleClick={() => { view.resetWidth('left') }}
        />
        <div
          className="acrylBlendsGrip acrylBlendsGripRight"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the right panel"
          hidden={!rightOpen}
          onPointerDown={startResize('right')}
          onDoubleClick={() => { view.resetWidth('right') }}
        />
      </div>
      {dialogPanel !== null && (
        <div className="acrylBlendsDialogBackdrop" onClick={(event) => { if (event.target === event.currentTarget) layout.selectPanel(null) }}>
          <div className="acrylBlendsDialog" role="dialog" aria-label={String(dialogPanel)}>
            <button type="button" className="acrylBlendsDialogClose" aria-label="Close" onClick={() => { layout.selectPanel(null) }}>×</button>
            {renderSlot('main', {}, { entryKey: dialogPanel })}
          </div>
        </div>
      )}
      <div className="acrylBlendsOverlay" data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
