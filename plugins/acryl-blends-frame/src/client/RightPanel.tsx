/**
 * The right panel (docs/design/blends-frame-mockup.html): everything the person works with, as tabs opened with +. Agents: the chat (DSH's
 * conversation with the model the person connected) and Claude Code, Codex or Pi as they are, TUIs in a PTY. Tools: a terminal, Files (fuzzy
 * search, a file opens as its own tab) and Git. There is no Browser: the canvas is the browser. The chat has History at its top left.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { FrameState } from '../contract.ts'
import { FilesView } from './FilesView.tsx'
import { FileView } from './FileView.tsx'
import { GitView } from './GitView.tsx'
import { NEW_CHAT } from './chats.ts'
import type { ChatsPort } from './LeftPanel.tsx'
import { historyGroups, type BranchChatsPort } from './branch-chats.ts'
import type { SwitchRequests } from './switch-request.ts'
import { DETAILS_TAB, FILES_TAB, GIT_TAB, PTY_AGENTS, chatTab, fileTab, fileTabLabels, ptyTab, tabsForBranch, terminalTab, type FrameTab, type FrameTabs, type PtyAgent } from './tabs.ts'
import { tabSizing } from './tab-sizing.ts'
import { TerminalView } from './TerminalView.tsx'
import type { FrameTools } from './tools.ts'
import { chatTime, type VersionsPort } from './versions.ts'
import type { GitSyncPort } from './git-sync.ts'

const HistoryIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.6h2.6M8 5v3.2l2 1.3" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
)

const PTY_NOTE = 'Claude, Codex and Pi run as they are, in a terminal. They drive the app from inside: they know the ACRYL app\'s architecture through its skills, extend it with Cordis plugins, and use the app\'s UI through acryl-control.'

export interface RightPanelProps {
  readonly chats: ChatsPort
  readonly tabs: FrameTabs
  readonly tools: FrameTools
  readonly versions: VersionsPort
  readonly gitSync: GitSyncPort
  readonly state: FrameState | undefined
  /** Which branch each chat was opened on, for the history's rows. */
  readonly branchChats: BranchChatsPort
  /** Where a chat of another branch is asked for: the left panel offers the switch first. */
  readonly switchRequests: SwitchRequests
  readonly renderConversation: () => ReactNode
  /** DSH's right sidebar (the `rightbar` slot) at the given width. Always mounted, so DSH's panel is there to open; shown only on its tab. */
  readonly renderDetails: (width: number) => ReactNode
  /** Whether DSH's right sidebar is open, as it reports through the layout; it opens and closes its tab here. */
  readonly details: { subscribe(listener: () => void): () => void; getSnapshot(): boolean }
  readonly sidebar: SidebarPort
}

/** DSH's right sidebar as the Panel tab drives it. */
export interface SidebarPort {
  /** Collapse it (DSH's own collapse), when the person closes its tab. */
  close(): void
  /** Expand it (DSH's own expand), when the person picks its tab. */
  expand(): void
  /** Hear each page opened in it. @returns the disposer. */
  onOpened(listener: () => void): () => void
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** The strip's content width, kept current as the panel opens, closes or resizes. */
function useStripWidth(ref: { readonly current: HTMLDivElement | null }): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const update = (): void => { setWidth(element.clientWidth) }
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [ref])
  return width
}

/**
 * A tab's label: the text ellipsizes inside the tab's share of the strip, and the kind (the chat's model, a PTY's "PTY") is left out when that share is too
 * narrow for it. The full text stays the button's accessible name, so a shortened label never hides what the tab is.
 */
function TabLabel({ tab, chatTitle, fileLabel, showKind }: { readonly tab: FrameTab; readonly chatTitle: string; readonly fileLabel?: string | undefined; readonly showKind: boolean }) {
  const kind = (text: string): ReactNode => (showKind ? <span className="acrylBlendsTabKind">{text}</span> : null)
  switch (tab.kind) {
    case 'chat': return tab.session === undefined
      ? <><span className="acrylBlendsTabLabel">Chat</span>{kind('DeepSeek')}</>
      : <><span className="acrylBlendsTabLabel">{chatTitle}</span>{kind('DeepSeek')}</>
    case 'pty': return <><span className="acrylBlendsTabLabel">{PTY_AGENTS.find(entry => entry.agent === tab.agent)?.tab}</span>{kind('PTY')}</>
    case 'terminal': return <span className="acrylBlendsTabLabel">Terminal</span>
    case 'files': return <span className="acrylBlendsTabLabel">Files</span>
    case 'file': {
      // The folder shows only when two open files share a name, so a tab stays its file's name whenever that name is enough.
      const label = fileLabel ?? baseName(tab.path)
      const folder = label.slice(0, label.lastIndexOf('/') + 1)
      return <span className="acrylBlendsTabLabel">{folder === '' ? label : <><span className="acrylBlendsTabPath">{folder}</span>{label.slice(folder.length)}</>}</span>
    }
    case 'git': return <span className="acrylBlendsTabLabel">Git</span>
    case 'details': return <span className="acrylBlendsTabLabel">Panel</span>
  }
}

export function RightPanel({ chats, tabs, tools, versions, gitSync, state, branchChats, switchRequests, renderConversation, renderDetails, details, sidebar }: RightPanelProps) {
  const subscribeChats = useCallback((listener: () => void) => chats.subscribe(listener), [chats])
  const rows = useSyncExternalStore(subscribeChats, () => chats.getSnapshot())
  const subscribeTabs = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs])
  const strip = useSyncExternalStore(subscribeTabs, () => tabs.getSnapshot())
  const subscribeAssignments = useCallback((listener: () => void) => branchChats.subscribe(listener), [branchChats])
  const assignments = useSyncExternalStore(subscribeAssignments, () => branchChats.getSnapshot())
  const subscribeOpen = useCallback((listener: () => void) => branchChats.subscribe(listener), [branchChats])
  const open = useSyncExternalStore(subscribeOpen, () => branchChats.getOpen())
  const openKnown = branchChats.isOpenKnown()
  const [history, setHistory] = useState(false)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const current = rows.find(row => row.current)
  // The strip shows the checked-out branch's tabs; another branch's stay open (a terminal keeps running) and come back with that branch.
  const branch = state?.branches.find(entry => entry.current)?.name
  const visible = tabsForBranch(strip, branch)
  // A file tab whose name another open file tab shares shows the folder that tells them apart.
  const fileLabels = fileTabLabels(visible.flatMap(tab => (tab.kind === 'file' ? [tab.path] : [])))
  const active = visible.find(tab => tab.id === strip.active) ?? visible[0]
  const root = state?.appRoot
  const shownChats = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === '' ? rows : rows.filter(row => row.title.toLowerCase().includes(needle))
  }, [rows, query])

  // Each tab's share of the strip; the labels ellipsize to it and the kind drops out when it is narrow (see tab-sizing.ts).
  const stripWidth = useStripWidth(stripRef)
  // DSH's right sidebar opens itself (a Plan card's button, a changed file, a file an answer names): its tab opens with it, and leaves when it closes.
  const subscribeDetails = useCallback((listener: () => void) => details.subscribe(listener), [details])
  const detailsOpen = useSyncExternalStore(subscribeDetails, () => details.getSnapshot())
  // The tab is remembered with the strip, so a page load that finds DSH's sidebar open (DSH remembers it too) leaves the strip on the tab the person was on.
  // DSH's own collapse closes the tab; DSH's own expand opens it when it is not in the strip.
  const detailsWere = useRef(false)
  useEffect(() => {
    const was = detailsWere.current
    detailsWere.current = detailsOpen
    const inStrip = tabs.getSnapshot().tabs.some(tab => tab.id === DETAILS_TAB.id)
    if (detailsOpen && !was && !inStrip) tabs.open(DETAILS_TAB)
    else if (!detailsOpen && was && inStrip) tabs.close(DETAILS_TAB.id)
  }, [detailsOpen, tabs])
  // A page opened while the sidebar is already shown changes nothing above, and still has to be seen.
  useEffect(() => sidebar.onOpened(() => { tabs.open(DETAILS_TAB) }), [sidebar, tabs])
  const sizing = tabSizing(stripWidth > 0 ? stripWidth : 396, visible.length)
  // The tab shown stays in view when the strip has to scroll; when the tabs share the width they all stay in view, so the strip starts at the first tab.
  useEffect(() => {
    const element = stripRef.current
    if (element === null) return
    if (!sizing.scroll) {
      element.scrollLeft = 0
      return
    }
    element.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active?.id, visible.length, sizing.scroll, sizing.width])

  useEffect(() => {
    if (!menu) return undefined
    const away = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false) }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape)
    }
  }, [menu])

  const start = async (command: PtyAgent | 'shell') => {
    setMenu(false)
    setNotice(undefined)
    try {
      const view = await tools.pty.start(command, root)
      tabs.open(command === 'shell' ? terminalTab(view.id) : ptyTab(command, view.id))
    } catch (cause) {
      const label = command === 'shell' ? 'The terminal' : PTY_AGENTS.find(entry => entry.agent === command)?.label ?? command
      setNotice(`${label} could not start: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const close = (id: string) => {
    // The base tab's chat is the chat on screen; its x closes it like any chat tab's, and the strip keeps the tab away until a chat opens again.
    const wasBaseShown = id === 'chat' && tabs.getSnapshot().active === 'chat'
    const baseChat = wasBaseShown ? rows.find(row => row.current) : undefined
    const closed = tabs.close(id)
    if (closed === undefined) return
    if (closed.kind === 'details' && detailsOpen) sidebar.close()
    if (closed.kind === 'pty' || closed.kind === 'terminal') {
      tools.terminals.release(closed.terminalId)
      void tools.pty.close(closed.terminalId).catch(() => {})
    }
    // Closing the shown tab may leave the strip on one of another branch's, which it does not draw: the first tab it draws is shown instead.
    const after = tabs.getSnapshot()
    const visibleAfter = tabsForBranch(after, branch)
    const afterActive = visibleAfter.find(tab => tab.id === after.active) ?? visibleAfter[0]
    if (visibleAfter.length > 0 && afterActive !== undefined && afterActive.id !== after.active) tabs.activate(afterActive.id)
    // A chat tab closed closes the chat: it leaves the left panel and waits in History. When it was on screen, the view moves to the chat of the tab
    // now shown, else to the base tab's chat (or a new one).
    if (closed.kind === 'chat') {
      const session = closed.session ?? (wasBaseShown ? baseChat?.id : undefined)
      if (session !== undefined) chats.closeChat(session, chatSessions(), afterActive?.kind === 'chat' ? afterActive.session : undefined)
    }
  }

  /** The chats that have a tab of their own on this branch; the base tab shows none of them. */
  const chatSessions = (): ReadonlySet<string> => new Set(tabsForBranch(tabs.getSnapshot(), branch).flatMap(tab => (tab.kind === 'chat' && tab.session !== undefined ? [tab.session] : [])))

  const showTab = (tab: FrameTab) => {
    tabs.activate(tab.id)
    // The tab of a sidebar DSH has collapsed (a page loaded that way) shows it again.
    if (tab.kind === 'details' && !detailsOpen) sidebar.expand()
    // A chat tab shows its own chat; the base tab shows the branch's chat that no other tab has.
    if (tab.kind === 'chat') {
      if (tab.session === undefined) chats.openPrimary(chatSessions())
      else chats.open(tab.session)
    }
  }

  // "+ then Chat": a chat of its own, on this branch, as its own tab. The chat on screen is reused while it has no turn (it already is a new chat).
  const newChat = async () => {
    setMenu(false)
    setNotice(undefined)
    try {
      const started = await chats.startChat()
      if (started === undefined) setNotice('A new chat could not be started.')
      else if (started.made) tabs.open(chatTab(started.id))
      else tabs.activate(tabs.chatTabId(started.id))
    } catch (cause) {
      setNotice(`A new chat could not be started: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const openTool = (tab: FrameTab) => {
    setMenu(false)
    tabs.open(tab)
  }

  return (
    <>
      <div className="acrylBlendsTabs" ref={menuRef}>
        <div className="acrylBlendsTabStrip" role="tablist" aria-label="Agents and tools" ref={stripRef} data-scroll={sizing.scroll || undefined}>
          {visible.map(tab => (
            <div key={tab.id} className="acrylBlendsTabWrap" data-closable={true} style={{ maxWidth: `${String(sizing.width)}px` }}>
              <button
                type="button"
                role="tab"
                className="acrylBlendsTab"
                aria-selected={tab.id === active?.id}
                title={tab.kind === 'file' ? tab.path : undefined}
                onClick={() => { showTab(tab) }}
                onAuxClick={(event) => { if (event.button === 1) close(tab.id) }}
              >
                <TabLabel tab={tab} chatTitle={rows.find(row => tab.kind === 'chat' && row.id === tab.session)?.title ?? NEW_CHAT} fileLabel={tab.kind === 'file' ? fileLabels.get(tab.path) : undefined} showKind={sizing.kind} />
              </button>
              <button type="button" className="acrylBlendsTabClose" aria-label="Close tab" onClick={() => { close(tab.id) }}>×</button>
            </div>
          ))}
          <button
            type="button"
            className="acrylBlendsIconButton acrylBlendsPlus"
            aria-label="Open an agent, a terminal, files or git"
            title="Open an agent, a terminal, files or git"
            aria-expanded={menu}
            onClick={() => { setMenu(value => !value) }}
          >
            <PlusIcon />
          </button>
        </div>
        {menu && (
          <div className="acrylBlendsMenu" role="menu">
            <div className="acrylBlendsMenuHead">Agents</div>
            <button type="button" role="menuitem" className="acrylBlendsMenuItem" onClick={() => { void newChat() }}>
              Chat <small>a new chat, your model</small>
            </button>
            {PTY_AGENTS.map(entry => (
              <button key={entry.agent} type="button" role="menuitem" className="acrylBlendsMenuItem" onClick={() => { void start(entry.agent) }}>
                {entry.label} <small>PTY</small>
              </button>
            ))}
            <div className="acrylBlendsMenuHead">Tools</div>
            <button type="button" role="menuitem" className="acrylBlendsMenuItem" onClick={() => { void start('shell') }}>
              Terminal <small>shell</small>
            </button>
            <button type="button" role="menuitem" className="acrylBlendsMenuItem" onClick={() => { openTool(FILES_TAB) }}>
              Files <small>tree; a file opens as a tab</small>
            </button>
            <button type="button" role="menuitem" className="acrylBlendsMenuItem" onClick={() => { openTool(GIT_TAB) }}>
              Git <small>changes, history, push and pull</small>
            </button>
            <div className="acrylBlendsMenuItem" data-gone aria-disabled="true">Browser <small>the canvas is it</small></div>
          </div>
        )}
      </div>
      {visible.length === 0 && (
        <p className="acrylBlendsPanelEmpty" role="status">No tab open. + to open Chat, an agent, a terminal, Files or Git</p>
      )}
      {notice !== undefined && (
        <p className="acrylBlendsNotice" role="alert">
          {notice}
          <button type="button" className="acrylBlendsTabClose" aria-label="Dismiss" onClick={() => { setNotice(undefined) }}>×</button>
        </p>
      )}
      {/* The chat stays mounted under the other tabs, so its scroll and draft survive a switch. */}
      <div className="acrylBlendsChatPane" hidden={active?.kind !== 'chat'}>
        <div className="acrylBlendsChatHead">
          <button
            type="button"
            className="acrylBlendsHistoryButton"
            aria-pressed={history}
            onClick={() => { setHistory(value => !value) }}
          >
            <HistoryIcon />History
          </button>
          <span className="acrylBlendsChatTitle">{current?.title ?? ''}</span>
        </div>
        {history && (
          <div className="acrylBlendsHistory" role="dialog" aria-label="Chat history">
            <input
              className="acrylBlendsSearch"
              aria-label="Search chats"
              placeholder="Search chats"
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
            />
            {shownChats.length === 0 && <p className="acrylBlendsNote">No chats match.</p>}
            {/* Every chat of the app, open or closed, grouped by the branch it was opened on, the checked-out branch first. A closed chat opens as a tab. */}
            {historyGroups(shownChats, assignments, branch).map(group => (
              <Fragment key={group.branch ?? ''}>
                <div className="acrylBlendsHistoryGroup">{group.branch ?? 'No branch'}</div>
                {group.rows.map((row) => {
                  // The chat on screen always belongs to the checked-out branch: one of another branch is opened through the switch, which the left panel offers.
                  const elsewhere = group.branch !== undefined && group.branch !== branch
                  const isOpen = row.current || !openKnown || open.has(row.id)
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="acrylBlendsHistoryRow"
                      aria-current={row.current || undefined}
                      data-closed={!isOpen || undefined}
                      title={elsewhere ? `On ${group.branch}: switch to that branch to open it.` : isOpen ? undefined : 'Open it as a tab'}
                      onClick={() => {
                        if (elsewhere && group.branch !== undefined) switchRequests.request({ branch: group.branch, chat: row.id })
                        else chats.show(row.id)
                        setHistory(false)
                      }}
                    >
                      {row.title}
                      <small>{[isOpen ? 'open' : 'closed', chatTime(row.updatedAt), isOpen || elsewhere ? '' : 'opens as a tab'].filter(part => part !== '').join(' · ')}</small>
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        )}
        <div className="acrylBlendsConversation" hidden={history}>
          {renderConversation()}
        </div>
      </div>
      {/* DSH's right sidebar stays mounted under the other tabs, as DSH keeps it: its tabs, panes and scroll survive a switch. It is sized by the strip,
          which is always on screen: hidden, it would measure nothing and DSH would fold it as too narrow. */}
      <div className="acrylBlendsDetails" hidden={active?.kind !== 'details'}>
        {renderDetails(stripWidth)}
      </div>
      {(active?.kind === 'pty' || active?.kind === 'terminal') && (
        <>
          <TerminalView key={active.terminalId} terminals={tools.terminals} terminalId={active.terminalId} />
          {active.kind === 'pty' && <p className="acrylBlendsPtyNote">{PTY_NOTE}</p>}
        </>
      )}
      {active?.kind === 'files' && root !== undefined && (
        <FilesView
          files={tools.files}
          root={root}
          // The file open as a tab (the latest one): the tree shows where it is.
          current={visible.findLast(tab => tab.kind === 'file')?.path}
          openFile={(path) => { tabs.open(fileTab(path)) }}
        />
      )}
      {active?.kind === 'file' && root !== undefined && <FileView key={active.path} files={tools.files} root={root} path={active.path} />}
      {active?.kind === 'git' && root !== undefined && (
        <GitView git={tools.git} versions={versions} sync={gitSync} root={root} revision={`${state?.head ?? ''}:${String(state?.unsaved ?? '')}`} />
      )}
    </>
  )
}
