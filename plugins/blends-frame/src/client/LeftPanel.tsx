/** The left panel: the app's branches, each with what is open on it, then the versions of the checked-out branch, and where the app runs. */

import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { formatRelativeTime } from 'acryl-versions/client'
import { branchNameProblem, type FeedbackNoteView, type FeedbackView, type FrameBranch, type FrameState } from '../contract.ts'
import type { VersionsLogView } from 'acryl-versions'
import { PTY_AGENTS, terminalMeta, type FrameTabs } from './tabs.ts'
import { backText, backToMessage, chatTime, saveBeforeBackMessage, shortTime, versionNumber, type VersionsPort } from './versions.ts'
import { branchClick, saveBeforeSwitchMessage, type BranchesApi } from './branches.ts'
import type { BranchChatsPort } from './branch-chats.ts'
import type { SwitchRequests } from './switch-request.ts'
import type { GitSyncPort } from './git-sync.ts'
import { RemoteChips } from './RemoteSync.tsx'
import { feedbackPlace, type FeedbackApi } from './feedback.ts'

/** A chat on the branch, as the left panel lists it. */
export interface ChatRow {
  readonly id: string
  readonly title: string
  readonly current: boolean
  /** When the chat last changed (ms since the epoch); absent when DSH did not say. */
  readonly updatedAt?: number
}

/** The chats the frame knows (DSH's sessions), and opening one in the right panel. */
export interface ChatsPort {
  getSnapshot(): readonly ChatRow[]
  subscribe(listener: () => void): () => void
  open(id: string): void
  /** A new chat on the checked-out branch, shown at once; undefined without DSH's sessions service. */
  create(): Promise<string | undefined>
  /** "+ then Chat": a chat of its own on the checked-out branch (the one on screen is reused while it has no turn). */
  startChat(): Promise<{ readonly id: string; readonly made: boolean } | undefined>
  /** Show the checked-out branch's chat for the base tab: its newest open chat that has no tab of its own, else a new one. */
  openPrimary(exclude: ReadonlySet<string>): void
  /** Open a chat of the checked-out branch from History: a closed chat becomes open, as a tab of its own, and is shown. */
  show(id: string): void
  /** Close a chat (its tab's x); when it is on screen the view moves to `prefer`, else to the base tab's chat, else to a new chat. */
  closeChat(id: string, tabbed: ReadonlySet<string>, prefer?: string): void
}

/** Feedback from users: the notes, and handing one to an agent (the chat's composer). */
export interface FeedbackPort {
  readonly api: FeedbackApi
  /** @returns false when there is no chat to hand it to. */
  hand(note: FeedbackNoteView): Promise<boolean>
}

/** How often the left panel asks for new feedback. */
const FEEDBACK_INTERVAL_MS = 15_000
/** How many notes the panel lists; the newest first. */
const FEEDBACK_SHOWN = 5

const BranchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <circle cx="4" cy="3.5" r="1.6" />
    <circle cx="4" cy="12.5" r="1.6" />
    <circle cx="12" cy="6" r="1.6" />
    <path d="M4 5v6M12 7.6c0 2.4-3 2.4-6.5 3.4" />
  </svg>
)

type VersionsLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly log: VersionsLogView }
  | { readonly status: 'error'; readonly message: string }

/** The left panel's branch calls: New, and moving to an existing branch with the state re-read and the app page reloaded. */
export interface BranchesPort {
  readonly api: BranchesApi
  readonly changed: () => Promise<void>
  /** Switch the app's folder to a branch, read the frame state again and reload the app page; rejects with the Host's reason. */
  readonly switchTo: (name: string) => Promise<void>
}

/** The branch row, chat or terminal a click would move to: the switch is offered first (a chat kept by another branch, or unsaved files). */
interface SwitchAsk {
  readonly branch: string
  /** The chat to open once the switch is done. */
  readonly chat?: string
  /** The terminal tab to show once the switch is done. */
  readonly tab?: string
}

export interface LeftPanelProps {
  readonly state: FrameState
  /** Read the frame state now (the unsaved count may have changed since the last poll); undefined when the Host could not be read. */
  readonly readState: () => Promise<FrameState | undefined>
  readonly chats: ChatsPort
  readonly versions: VersionsPort
  /** The right panel's tabs: the branch lists its open agents and terminals, and a click shows one. */
  readonly tabs: FrameTabs
  readonly feedback: FeedbackPort
  readonly branches: BranchesPort
  /** Which branch each chat was opened on (DSH keeps none; the Host records it). */
  readonly branchChats: BranchChatsPort
  /** A chat of another branch asked for from the chat's History: the switch is offered here, with the same guard as a click on the panel's own rows. */
  readonly switchRequests: SwitchRequests
  /** Show a right panel tab (opening the panel when it is closed). */
  readonly showTab: (id: string) => void
  /** Told the newest version's label ("v7"), for the top bar. */
  readonly onVersionLabel: (label: string | undefined) => void
  /** The branch's remote: the versions header's ↑/↓ chips send the versions there and bring its new ones in (the Git tab's Push and Pull). */
  readonly gitSync: GitSyncPort
}

export function LeftPanel({ state, readState, chats, versions, tabs, feedback, branches, branchChats, switchRequests, showTab, onVersionLabel, gitSync }: LeftPanelProps) {
  const subscribe = useCallback((listener: () => void) => chats.subscribe(listener), [chats])
  const chatRows = useSyncExternalStore(subscribe, () => chats.getSnapshot())
  const subscribeTabs = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs])
  const strip = useSyncExternalStore(subscribeTabs, () => tabs.getSnapshot())
  const subscribeAssignments = useCallback((listener: () => void) => branchChats.subscribe(listener), [branchChats])
  const assignments = useSyncExternalStore(subscribeAssignments, () => branchChats.getSnapshot())
  const open = useSyncExternalStore(subscribeAssignments, () => branchChats.getOpen())
  const openKnown = branchChats.isOpenKnown()
  const terminals = strip.tabs.flatMap(tab => (tab.kind === 'pty' || tab.kind === 'terminal' ? [tab] : []))
  const currentBranch = state.branches.find(branch => branch.current)?.name
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(state.branches.filter(b => b.current).map(b => b.name)))
  const [load, setLoad] = useState<VersionsLoad>({ status: 'loading' })
  /** The versions also on another branch or the remote, marked "shared". */
  const [shared, setShared] = useState<ReadonlySet<string>>(() => new Set())
  const [saving, setSaving] = useState<string | undefined>(undefined)
  // The older version a click chose to go back to (asked first), and whether that is running.
  const [askBack, setAskBack] = useState<{ readonly hash: string; readonly number: number; readonly subject: string } | undefined>(undefined)
  const [backing, setBacking] = useState<'saving' | 'going back' | undefined>(undefined)
  const [backNote, setBackNote] = useState<string | undefined>(undefined)
  // The new branch's name while it is typed, and why the last try failed.
  const [naming, setNaming] = useState<string | undefined>(undefined)
  const [branchProblem, setBranchProblem] = useState<string | undefined>(undefined)
  // The branch row, chat or terminal a click would move to, asking first because files are unsaved or the item is kept by another branch; the
  // branch in flight; and why the last try failed.
  const [askSwitch, setAskSwitch] = useState<SwitchAsk | undefined>(undefined)
  const [busySwitch, setBusySwitch] = useState<{ readonly branch: string; readonly phase: 'saving' | 'switching' } | undefined>(undefined)
  const [switchNote, setSwitchNote] = useState<{ readonly branch: string; readonly message: string } | undefined>(undefined)
  const [notes, setNotes] = useState<FeedbackView>({ available: false, notes: [] })
  const [handNote, setHandNote] = useState<string | undefined>(undefined)

  // A chat the History could not open here, because it is on another branch: the same ask as a click on one of this panel's rows.
  const request = useSyncExternalStore(
    useCallback((listener: () => void) => switchRequests.subscribe(listener), [switchRequests]),
    () => switchRequests.getSnapshot(),
  )
  useEffect(() => {
    if (request === undefined || busySwitch !== undefined) return
    switchRequests.clear()
    setSwitchNote(undefined)
    setAskSwitch({ branch: request.branch, chat: request.chat })
    setExpanded(current => new Set(current).add(request.branch))
  }, [request, switchRequests, busySwitch])

  const readFeedback = useCallback(async () => {
    try {
      setNotes(await feedback.api.read())
    } catch {
      // The section keeps what it showed; the next read tries again.
    }
  }, [feedback])
  useEffect(() => {
    void readFeedback()
    const timer = window.setInterval(() => { void readFeedback() }, FEEDBACK_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [readFeedback])

  const hand = async (note: FeedbackNoteView) => {
    setHandNote(await feedback.hand(note) ? undefined : 'Open a chat first, then hand the note to it.')
    if (!note.seen) {
      await feedback.api.markSeen([note.id]).catch(() => {})
      await readFeedback()
    }
  }

  const refresh = useCallback(async () => {
    try {
      const log = await versions.log(state.appRoot)
      setLoad({ status: 'ready', log })
      // The shared marks are another Host read: the list shows at once, the marks follow; a failed check leaves the times.
      setShared(new Set(await versions.shared(log.entries.map(entry => entry.hash)).catch(() => [])))
    } catch (cause) {
      setLoad({ status: 'error', message: cause instanceof Error ? cause.message : 'The versions could not be read.' })
    }
  }, [versions, state.appRoot])

  // A new head is a new version, whoever made it (a save here, an agent's commit, a restore): read the list again.
  useEffect(() => { void refresh() }, [refresh, state.head, state.upstreamHead])
  useEffect(() => {
    onVersionLabel(load.status === 'ready' && load.log.entries.length > 0 ? `v${String(load.log.entries.length)}` : undefined)
  }, [load, onVersionLabel])

  const toggle = (name: string) => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const createBranch = async () => {
    if (naming === undefined) return
    const name = naming.trim()
    const problem = branchNameProblem(name)
    if (problem !== undefined) {
      setBranchProblem(problem)
      return
    }
    try {
      await branches.api.create(name)
      setNaming(undefined)
      setBranchProblem(undefined)
      setExpanded(current => new Set(current).add(name))
      await branches.changed()
    } catch (cause) {
      setBranchProblem(cause instanceof Error ? cause.message : 'The branch could not be made.')
    }
  }

  const save = async () => {
    if (saving === undefined || saving.trim() === '') return
    try {
      await versions.save(state.appRoot, saving.trim())
      setSaving(undefined)
      await refresh()
    } catch (cause) {
      setLoad({ status: 'error', message: cause instanceof Error ? cause.message : 'The save point could not be made.' })
    }
  }

  // Going back never loses work and never rewrites history: unsaved files get a save point first, then the Host puts the old tree back as a new version
  // on top, and the frame shows it (head read again, app page reloaded).
  const goBack = async (target: { readonly hash: string; readonly number: number; readonly subject: string }) => {
    setBackNote(undefined)
    try {
      // The question was answered on the count it showed; when files changed since, the question shows the new count and waits for a new answer.
      const fresh = await readState()
      if (fresh === undefined) {
        setBackNote('The app\'s files could not be read just now, so nothing changed. Try again.')
        return
      }
      if ((fresh.unsaved === 0) !== (state.unsaved === 0)) return
      if (fresh.unsaved !== 0) {
        setBacking('saving')
        await versions.save(state.appRoot, saveBeforeBackMessage(target.number))
      }
      setBacking('going back')
      await versions.restore(state.appRoot, target.hash, backToMessage(target.number, target.subject))
      setAskBack(undefined)
      await refresh()
    } catch (cause) {
      setBackNote(cause instanceof Error ? cause.message : 'The app could not be put back to that version.')
    } finally {
      setBacking(undefined)
    }
  }

  // A save point when the person chose one, then the Host moves the folder; the frame state re-read marks the new current branch, and the
  // composition reloads the app page on its files (switch, state, canvas - in that order). Nothing here stashes or discards work.
  const switchTo = async (ask: SwitchAsk, saveFirst: boolean) => {
    setSwitchNote(undefined)
    // A switch without a save point only on a tree that is clean now: files changed since the click show the question with their count instead.
    if (!saveFirst) {
      const fresh = await readState()
      if (fresh?.unsaved !== 0) {
        setAskSwitch(ask)
        return
      }
    }
    setBusySwitch({ branch: ask.branch, phase: saveFirst ? 'saving' : 'switching' })
    try {
      if (saveFirst) {
        await versions.save(state.appRoot, saveBeforeSwitchMessage(ask.branch))
        setBusySwitch({ branch: ask.branch, phase: 'switching' })
      }
      await branches.switchTo(ask.branch)
      setAskSwitch(undefined)
      setExpanded(current => new Set(current).add(ask.branch))
      // What the click meant: that chat, that terminal, or the branch's own conversation. The chat on screen becomes the branch's own by itself
      // (`ChatsStore.reconcile`, on the state this switch re-read), whoever moved the folder; here only the item that was clicked is opened.
      if (ask.chat !== undefined) {
        // A closed chat (picked in History) opens as a tab of its own; an open one is shown.
        chats.show(ask.chat)
        showTab(tabs.chatTabId(ask.chat))
      } else if (ask.tab !== undefined) {
        showTab(ask.tab)
      } else {
        // The branch's conversation: a chat tab that is showing already follows the chat on screen (the strip does, as it changes), so only a tool tab
        // (a terminal, a file) is left for the chat.
        const strip = tabs.getSnapshot()
        if (strip.tabs.find(tab => tab.id === strip.active)?.kind !== 'chat') showTab('chat')
      }
    } catch (cause) {
      setSwitchNote({ branch: ask.branch, message: cause instanceof Error ? cause.message : 'The branch could not be switched to.' })
    } finally {
      setBusySwitch(undefined)
    }
  }

  const clickBranch = (branch: FrameBranch) => {
    if (busySwitch !== undefined) return
    const action = branchClick(branch, state.unsaved)
    if (action === 'toggle') {
      toggle(branch.name)
    } else if (action === 'switch') {
      void switchTo({ branch: branch.name }, false)
    } else {
      setSwitchNote(undefined)
      setAskSwitch({ branch: branch.name })
      void readState()
    }
  }

  /** A chat or a terminal tab kept by another branch: switching is offered first, and the item opens once the folder has moved. */
  const openElsewhere = (ask: SwitchAsk) => {
    if (busySwitch !== undefined) return
    setSwitchNote(undefined)
    setAskSwitch(ask)
    void readState()
  }

  /** Only a clean tree (zero unsaved files) and a clicked item switch without a save point; a branch row with unsaved files always saves first. */
  const needsSave = (ask: SwitchAsk): boolean => (ask.chat === undefined && ask.tab === undefined) || state.unsaved !== 0

  const askText = (ask: SwitchAsk): string => {
    const count = state.unsaved
    const andOpen = ask.chat !== undefined || ask.tab !== undefined
    const what = ask.chat !== undefined ? 'This chat' : 'This terminal'
    const then = andOpen ? ' then switch and open it' : ' then switch'
    if (andOpen && count === 0) return `${what} is on ${ask.branch}. Switch and open it?`
    if (count === undefined) return `The unsaved files could not be counted. Save a point first,${then}.`
    if (count === 0) return `Switch to ${ask.branch}?`
    return `${String(count)} unsaved ${count === 1 ? 'change' : 'changes'}. Save a point first,${then}.`
  }

  /** What the ask's first button says while its work runs; it saves first only when the tree is not clean. */
  const primaryLabel = (ask: SwitchAsk): string => {
    if (busySwitch?.branch !== ask.branch) return needsSave(ask) ? 'Save a point first' : 'Switch and open'
    return busySwitch.phase === 'saving' ? 'Saving...' : 'Switching...'
  }

  const askBox = (ask: SwitchAsk) => (
    <div className="acrylBlendsAsk" role="group" aria-label={`Switch to ${ask.branch}`}>
      <p>{askText(ask)}</p>
      <div className="acrylBlendsAskActions">
        <button
          type="button"
          className="acrylBlendsSmallButton"
          disabled={busySwitch !== undefined}
          onClick={() => { void switchTo(ask, needsSave(ask)) }}
        >
          {primaryLabel(ask)}
        </button>
        <button
          type="button"
          className="acrylBlendsSmallButton"
          disabled={busySwitch !== undefined}
          onClick={() => { setAskSwitch(undefined) }}
        >
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="acrylBlendsPaneHead">
        <span className="acrylBlendsLabel">Branches</span>
        {state.branches.length > 0 && (
          <button
            type="button"
            className="acrylBlendsSmallButton"
            title="A new branch from the current version; your files stay as they are"
            onClick={() => { setBranchProblem(undefined); setNaming(current => (current === undefined ? '' : undefined)) }}
          >
            New
          </button>
        )}
      </div>
      {naming !== undefined && (
        <form className="acrylBlendsSaveForm" onSubmit={(event) => { event.preventDefault(); void createBranch() }}>
          <input
            autoFocus
            aria-label="Branch name"
            placeholder="Branch name, e.g. feature-due-dates"
            value={naming}
            onChange={(event) => { setNaming(event.target.value); setBranchProblem(undefined) }}
            onKeyDown={(event) => { if (event.key === 'Escape') setNaming(undefined) }}
          />
          {branchProblem !== undefined && <p className="acrylBlendsNote" data-error>{branchProblem}</p>}
        </form>
      )}
      <div className="acrylBlendsList">
        {state.branches.length === 0 && <p className="acrylBlendsNote">This app's folder is not a git repository.</p>}
        {state.branches.map(branch => {
          // Every branch opens onto what is open on it: its own chats, and the terminals and agents opened there. A branch with nothing open
          // stays closed: an open caret always has its rows under it.
          // Only the open chats are listed (a chat with a tab, or on screen); the rest are closed, found in the chat's History.
          const ownChats = chatRows.filter(row => (assignments[row.id] ?? currentBranch) === branch.name && (!openKnown || open.has(row.id)))
          const ownTerminals = terminals.filter(tab => tab.branch === branch.name)
          const count = ownChats.length + ownTerminals.length
          const unfolded = expanded.has(branch.name) && count > 0
          // The ask sits under its item; one with no row here (a branch row, or a closed chat picked in History) sits under the branch.
          const branchAsk = askSwitch !== undefined && askSwitch.branch === branch.name
            && (askSwitch.chat === undefined ? askSwitch.tab === undefined : !ownChats.some(row => row.id === askSwitch.chat))
          return (
            <div key={branch.name} className="acrylBlendsBranchGroup">
              <div className="acrylBlendsBranchRow">
                {count > 0 ? (
                  <button
                    type="button"
                    className="acrylBlendsCaretButton"
                    aria-expanded={unfolded}
                    aria-label={`${unfolded ? 'Hide' : 'Show'} what is open on ${branch.name}`}
                    title={`${unfolded ? 'Hide' : 'Show'} what is open on ${branch.name}`}
                    onClick={() => { toggle(branch.name) }}
                  >
                    <svg className="acrylBlendsCaret" data-open={unfolded || undefined} viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" /></svg>
                  </button>
                ) : (
                  <span className="acrylBlendsCaretSpace" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="acrylBlendsBranch"
                  title={branch.current ? 'Show what is open on this branch' : `Switch to ${branch.name}`}
                  onClick={() => { clickBranch(branch) }}
                >
                  <BranchIcon />
                  <span className="acrylBlendsBranchName">{branch.name}</span>
                  <span className="acrylBlendsMeta">
                    {branch.current ? <span className="acrylBlendsDot" data-live /> : count > 0 ? `${String(count)} open` : ''}
                  </span>
                </button>
              </div>
              {branchAsk && askBox(askSwitch)}
              {switchNote?.branch === branch.name && <p className="acrylBlendsNote" data-error>{switchNote.message}</p>}
              {unfolded && ownChats.map(item => (
                <Fragment key={item.id}>
                  <button
                    type="button"
                    className="acrylBlendsItem"
                    aria-current={(branch.current && item.current && strip.tabs.some(tab => tab.id === strip.active && tab.kind === 'chat')) || undefined}
                    onClick={() => {
                      if (branch.current) {
                        chats.open(item.id)
                        showTab(tabs.chatTabId(item.id))
                      } else {
                        openElsewhere({ branch: branch.name, chat: item.id })
                      }
                    }}
                  >
                    <span className="acrylBlendsItemIcon">◆</span>
                    <span className="acrylBlendsItemTitle">Chat · {item.title}</span>
                    <span className="acrylBlendsMeta acrylBlendsItemMeta">{chatTime(item.updatedAt)}</span>
                  </button>
                  {askSwitch?.chat === item.id && askBox(askSwitch)}
                </Fragment>
              ))}
              {unfolded && ownTerminals.map(tab => (
                <Fragment key={tab.id}>
                  <button
                    type="button"
                    className="acrylBlendsItem"
                    aria-current={(branch.current && strip.active === tab.id) || undefined}
                    onClick={() => {
                      if (branch.current) showTab(tab.id)
                      else openElsewhere({ branch: branch.name, tab: tab.id })
                    }}
                  >
                    <span className="acrylBlendsItemIcon">{tab.kind === 'pty' ? '>_' : '$'}</span>
                    <span className="acrylBlendsItemTitle">{tab.kind === 'pty' ? PTY_AGENTS.find(entry => entry.agent === tab.agent)?.label : 'Terminal'}</span>
                    <span className="acrylBlendsMeta acrylBlendsItemMeta">{tab.kind === 'pty' ? 'PTY' : terminalMeta(strip.titles?.[tab.terminalId])}</span>
                  </button>
                  {askSwitch?.tab === tab.id && askBox(askSwitch)}
                </Fragment>
              ))}
            </div>
          )
        })}
      </div>
      <div className="acrylBlendsSep" />
      <div className="acrylBlendsPaneHead">
        <span className="acrylBlendsLabel">Versions</span>
        <span className="acrylBlendsPaneActions">
          <RemoteChips sync={gitSync} root={state.appRoot} revision={`${state.head ?? ''}:${String(state.upstreamHead ?? '')}`} />
          <button type="button" className="acrylBlendsSmallButton" onClick={() => { setSaving(current => (current === undefined ? '' : undefined)) }}>
            Save point
          </button>
        </span>
      </div>
      {saving !== undefined && (
        <form className="acrylBlendsSaveForm" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <input
            autoFocus
            aria-label="What changed"
            placeholder="What changed?"
            value={saving}
            onChange={(event) => { setSaving(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Escape') setSaving(undefined) }}
          />
        </form>
      )}
      <div className="acrylBlendsList">
        {load.status === 'error' && <p className="acrylBlendsNote" data-error>{load.message}</p>}
        {load.status === 'ready' && load.log.entries.length === 0 && <p className="acrylBlendsNote">No versions yet.</p>}
        {load.status === 'ready' && load.log.entries.map((entry, index) => {
          const number = versionNumber(load.log.entries, index)
          const target = { hash: entry.hash, number, subject: entry.subject }
          const asking = askBack?.hash === entry.hash
          return (
            <Fragment key={entry.hash}>
              <div
                className="acrylBlendsVersion"
                aria-current={index === 0 || undefined}
                data-back={index > 0 || undefined}
                title={index === 0 ? `${entry.short} · ${entry.author}` : `Go back to v${String(number)} · ${entry.short} · ${entry.author}`}
                role={index === 0 ? undefined : 'button'}
                tabIndex={index === 0 ? undefined : 0}
                onClick={index === 0 ? undefined : () => { if (backing === undefined) { setBackNote(undefined); setAskBack(asking ? undefined : target); void readState() } }}
                onKeyDown={index === 0 ? undefined : (event) => { if (event.key === 'Enter' && backing === undefined) { setBackNote(undefined); setAskBack(asking ? undefined : target); void readState() } }}
              >
                <span className="acrylBlendsVersionDot" />
                <span className="acrylBlendsItemTitle">
                  v{String(number)} · {entry.subject}{index === 0 ? ' (current)' : ''}
                </span>
                <span className="acrylBlendsMeta">{shared.has(entry.hash) ? 'shared' : shortTime(entry.at)}</span>
              </div>
              {asking && (
                <div className="acrylBlendsAsk acrylBlendsBackAsk" role="group" aria-label={`Go back to v${String(number)}`}>
                  <p>{backText(number, entry.subject, state.unsaved)}</p>
                  {backNote !== undefined && <p data-error>{backNote}</p>}
                  <div className="acrylBlendsAskActions">
                    <button type="button" className="acrylBlendsSmallButton" disabled={backing !== undefined} onClick={() => { void goBack(target) }}>
                      {backing === 'saving' ? 'Saving...' : backing === 'going back' ? 'Going back...' : state.unsaved === 0 ? 'Go back' : 'Save a point first'}
                    </button>
                    <button type="button" className="acrylBlendsSmallButton" disabled={backing !== undefined} onClick={() => { setAskBack(undefined) }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
      {notes.available && (
        <>
          <div className="acrylBlendsSep" />
          <div className="acrylBlendsPaneHead">
            <span className="acrylBlendsLabel">Feedback from users</span>
            {notes.notes.some(note => !note.seen) && <span className="acrylBlendsFeedbackNew">{String(notes.notes.filter(note => !note.seen).length)} new</span>}
          </div>
          <div className="acrylBlendsList">
            {notes.notes.length === 0 && <p className="acrylBlendsNote">No feedback yet. People send it with the Feedback button on the app's pages.</p>}
            {handNote !== undefined && <p className="acrylBlendsNote" data-error>{handNote}</p>}
            {notes.notes.slice(0, FEEDBACK_SHOWN).map(note => (
              <button
                key={note.id}
                type="button"
                className="acrylBlendsFeedback"
                data-seen={note.seen || undefined}
                title="Hand it to an agent: the note goes into the chat, ready to send"
                onClick={() => { void hand(note) }}
              >
                <span><b>{feedbackPlace(note, state.appPage ?? '')}</b> · "{note.text}"</span>
                <small>{note.element === undefined ? 'nothing specific' : `pinned on ${note.element.label}`} · {formatRelativeTime(note.at)}</small>
                {note.screenshot !== undefined && (
                  <img className="acrylBlendsFeedbackThumb" src={feedback.api.shotUrl(note.id)} alt="" loading="lazy" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="acrylBlendsLeftFoot">
        <span className="acrylBlendsDot" data-live />
        Running locally · port {window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}
      </div>
    </>
  )
}
