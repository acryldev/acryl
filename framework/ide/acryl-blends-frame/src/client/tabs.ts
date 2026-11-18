/**
 * The right panel's tabs (docs/design/blends-frame-mockup.html): the chat, PTY agents (Claude Code, Codex, Pi as they are, in a terminal), a
 * terminal, Files, a file opened from it, and Git. One store for the right panel's strip and the left panel's open items; remembered per page.
 * A terminal tab names the Host's PTY session, which outlives the page, so a reload shows the same terminal again. Every tab but the chat belongs
 * to the branch it was opened on: the strip shows the checked-out branch's tabs, and the others stay (a terminal keeps running) out of the list.
 */

import type { ViewStorage } from './view-state.ts'

/** The PTY agents the + menu offers, in its order: their workspace agent ids and labels. */
export const PTY_AGENTS = [
  { agent: 'claude', label: 'Claude Code', tab: 'Claude' },
  { agent: 'codex', label: 'Codex', tab: 'Codex' },
  { agent: 'pi', label: 'Pi', tab: 'Pi' },
] as const

export type PtyAgent = (typeof PTY_AGENTS)[number]['agent']

export type FrameTab =
  /** `chat` is the base tab, always there: the branch's chat. A chat made with "+ then Chat" has a tab of its own, named `chat:<session>`. */
  | { readonly kind: 'chat'; readonly id: string; readonly session?: string; readonly branch?: string }
  | { readonly kind: 'pty'; readonly id: string; readonly agent: PtyAgent; readonly terminalId: string; readonly branch?: string }
  | { readonly kind: 'terminal'; readonly id: string; readonly terminalId: string; readonly branch?: string }
  | { readonly kind: 'files'; readonly id: 'files'; readonly branch?: string }
  | { readonly kind: 'file'; readonly id: string; readonly path: string; readonly branch?: string }
  | { readonly kind: 'git'; readonly id: 'git'; readonly branch?: string }
  /**
   * DSH's right sidebar (`ui-sidebar-right`): the Plan, the changed-files review and the files an answer links to, as DSH draws them. It shows the chat on
   * screen, whatever the branch, so it is on every branch like the base chat tab.
   */
  | { readonly kind: 'details'; readonly id: 'details'; readonly branch?: string }

export interface FrameTabsSnapshot {
  readonly tabs: readonly FrameTab[]
  readonly active: string
  /**
   * The base chat tab's x was pressed: its chat was closed like any chat tab's, and the strip keeps the tab away until a chat is opened again.
   * Absent means open, the first-run state.
   */
  readonly baseClosed?: boolean
  /**
   * What each terminal says it runs (its title, as a shell sets it: `npm test`), by terminal id. Remembered, so a terminal row still says what ran in it
   * after the page reloads or the Host restarts and the shell that set the title is gone.
   */
  readonly titles?: Readonly<Record<string, string>>
}

const STORAGE_KEY = 'acryl-blends-frame.tabs.v1'
const CHAT: FrameTab = { kind: 'chat', id: 'chat' }
/** The base chat tab: always first, never closed, on every branch. */
const isBase = (tab: FrameTab): boolean => tab.kind === 'chat' && tab.id === 'chat'
/** The tabs no branch owns: the base chat tab and DSH's sidebar. */
const onEveryBranch = (tab: FrameTab): boolean => isBase(tab) || tab.kind === 'details'

/** The first run: the chat alone. */
export const FIRST_RUN_TABS: FrameTabsSnapshot = { tabs: [CHAT], active: 'chat' }

export const chatTab = (session: string): FrameTab => ({ kind: 'chat', id: `chat:${session}`, session })
export const ptyTab = (agent: PtyAgent, terminalId: string): FrameTab => ({ kind: 'pty', id: `pty:${terminalId}`, agent, terminalId })
export const terminalTab = (terminalId: string): FrameTab => ({ kind: 'terminal', id: `terminal:${terminalId}`, terminalId })
export const fileTab = (path: string): FrameTab => ({ kind: 'file', id: `file:${path}`, path })
export const FILES_TAB: FrameTab = { kind: 'files', id: 'files' }
export const GIT_TAB: FrameTab = { kind: 'git', id: 'git' }
export const DETAILS_TAB: FrameTab = { kind: 'details', id: 'details' }

/** The last `count` segments of a path. */
const suffix = (parts: readonly string[], count: number): string => parts.slice(Math.max(0, parts.length - count)).join('/')

/**
 * What each file tab calls itself: the file's name, or as much of its folder as it takes to tell it from the other file tabs open beside it. Two
 * `index.ts` in different folders read `team-board/index.ts` and `src/index.ts`; a name no other tab shares keeps its file name alone.
 */
export function fileTabLabels(paths: readonly string[]): ReadonlyMap<string, string> {
  const split = new Map(paths.map(path => [path, path.split('/')]))
  const labels = new Map<string, string>()
  for (const path of paths) {
    const parts = split.get(path) as string[]
    let count = 1
    while (count < parts.length && paths.some(other => other !== path && suffix(split.get(other) as string[], count) === suffix(parts, count))) count += 1
    labels.set(path, suffix(parts, count))
  }
  return labels
}

/**
 * The tabs the strip shows on a branch: the base chat (unless its x closed it), and what was opened on that branch. No branch (outside a repository):
 * every tab.
 */
export function tabsForBranch(snapshot: FrameTabsSnapshot, branch: string | undefined): readonly FrameTab[] {
  const tabs = snapshot.baseClosed === true ? snapshot.tabs.filter(tab => !isBase(tab)) : snapshot.tabs
  if (branch === undefined) return tabs
  return tabs.filter(tab => onEveryBranch(tab) || tab.branch === branch)
}

const stamped = (tab: FrameTab, branch: string | undefined): FrameTab => (branch === undefined ? tab : { ...tab, branch })

function parseTab(value: unknown): FrameTab | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const tab = value as Record<string, unknown>
  const text = (key: string): string | undefined => (typeof tab[key] === 'string' && tab[key] !== '' ? tab[key] as string : undefined)
  const branch = text('branch')
  switch (tab.kind) {
    case 'chat': { const session = text('session'); return session === undefined ? CHAT : stamped(chatTab(session), branch) }
    case 'files': return stamped(FILES_TAB, branch)
    case 'git': return stamped(GIT_TAB, branch)
    case 'details': return DETAILS_TAB
    case 'file': { const path = text('path'); return path === undefined ? undefined : stamped(fileTab(path), branch) }
    case 'terminal': { const id = text('terminalId'); return id === undefined ? undefined : stamped(terminalTab(id), branch) }
    case 'pty': {
      const id = text('terminalId')
      const agent = PTY_AGENTS.find(entry => entry.agent === tab.agent)?.agent
      return id === undefined || agent === undefined ? undefined : stamped(ptyTab(agent, id), branch)
    }
    default: return undefined
  }
}

/** The terminal ids with a tab in `tabs`. */
function openTerminals(tabs: readonly FrameTab[]): ReadonlySet<string> {
  return new Set(tabs.flatMap(tab => (tab.kind === 'pty' || tab.kind === 'terminal' ? [tab.terminalId] : [])))
}

/**
 * The titles worth remembering for `tabs`: one per open terminal, and the very same map when nothing was dropped, so a caller can compare by reference.
 * A closed terminal's title goes with its tab.
 */
function keptTitles(
  titles: Readonly<Record<string, string>> | undefined,
  tabs: readonly FrameTab[],
): Readonly<Record<string, string>> | undefined {
  if (titles === undefined) return undefined
  const open = openTerminals(tabs)
  const kept: Record<string, string> = {}
  for (const [terminalId, title] of Object.entries(titles)) if (open.has(terminalId) && title !== '') kept[terminalId] = title
  const ids = Object.keys(kept)
  if (ids.length === 0) return undefined
  const before = Object.keys(titles)
  return ids.length === before.length && ids.every(id => titles[id] === kept[id]) ? titles : kept
}

/** What a remembered strip said about terminal titles; entries that are not text are dropped. */
function parseTitles(raw: unknown): Readonly<Record<string, string>> | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const titles: Record<string, string> = {}
  for (const [terminalId, title] of Object.entries(raw as Record<string, unknown>)) if (typeof title === 'string' && title !== '') titles[terminalId] = title
  return Object.keys(titles).length === 0 ? undefined : titles
}

/** A remembered strip, or the first run's when it is missing or malformed. The chat is always there, first. */
export function parseStoredTabs(raw: string | null): FrameTabsSnapshot {
  if (raw === null) return FIRST_RUN_TABS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return FIRST_RUN_TABS
  }
  if (value === null || typeof value !== 'object' || !Array.isArray((value as { tabs?: unknown }).tabs)) return FIRST_RUN_TABS
  const tabs: FrameTab[] = [CHAT]
  for (const entry of (value as { tabs: unknown[] }).tabs) {
    const tab = parseTab(entry)
    if (tab !== undefined && !tabs.some(existing => existing.id === tab.id)) tabs.push(tab)
  }
  const active = (value as { active?: unknown }).active
  const titles = keptTitles(parseTitles((value as { titles?: unknown }).titles), tabs)
  const baseClosed = (value as { baseClosed?: unknown }).baseClosed === true
  return {
    tabs,
    active: typeof active === 'string' && tabs.some(tab => tab.id === active) ? active : 'chat',
    ...(baseClosed ? { baseClosed: true } : {}),
    ...(titles === undefined ? {} : { titles }),
  }
}

/** Whether the remembered strip already went through the branch migration (`setBranch`). */
function parseStoredBranching(raw: string | null): boolean {
  if (raw === null) return false
  try {
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && (value as { branched?: unknown }).branched === true
  } catch {
    return false
  }
}

/** The tab a terminal session shows in, if one does. */
export function tabOfTerminal(snapshot: FrameTabsSnapshot, terminalId: string): FrameTab | undefined {
  return snapshot.tabs.find(tab => (tab.kind === 'pty' || tab.kind === 'terminal') && tab.terminalId === terminalId)
}

export class FrameTabs {
  private snapshot: FrameTabsSnapshot
  private readonly listeners = new Set<() => void>()
  /** The checked-out branch the strip is showing; new tabs are opened on it. */
  private branch: string | undefined
  /** Whether the remembered tabs already went through the branch migration (see `setBranch`). */
  private branched: boolean

  constructor(private readonly storage?: ViewStorage) {
    let raw: string | null = null
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    this.snapshot = parseStoredTabs(raw)
    this.branched = parseStoredBranching(raw)
  }

  getSnapshot(): FrameTabsSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * The checked-out branch. The first time it is known, the tabs remembered before branches had their own lists (every tab carried no branch) are
   * put on that branch, which is where they were opened as far as anyone can tell; later calls only change where new tabs go.
   */
  setBranch(branch: string | undefined): void {
    this.branch = branch
    if (this.branched || branch === undefined) return
    this.branched = true
    this.set({ tabs: this.snapshot.tabs.map(tab => (onEveryBranch(tab) || tab.branch !== undefined ? tab : { ...tab, branch })), active: this.snapshot.active })
  }

  /** Show a tab, adding it at the end of the strip when it is not open yet; a tab opened now belongs to the checked-out branch. */
  open(tab: FrameTab): void {
    const next = !onEveryBranch(tab) && tab.branch === undefined && this.branch !== undefined ? { ...tab, branch: this.branch } : tab
    const open = this.snapshot.tabs.some(existing => existing.id === next.id)
    this.set({
      tabs: open ? this.snapshot.tabs : [...this.snapshot.tabs, next],
      active: next.id,
      ...(isBase(next) ? { baseClosed: false } : {}),
    })
  }

  /** Add tabs that are not in the strip yet, at the end, without showing them; a tab added now belongs to the checked-out branch. */
  add(...added: readonly FrameTab[]): void {
    const fresh = added
      .filter(tab => !this.snapshot.tabs.some(existing => existing.id === tab.id))
      .map(tab => (!onEveryBranch(tab) && tab.branch === undefined && this.branch !== undefined ? { ...tab, branch: this.branch } : tab))
    if (fresh.length > 0) this.set({ tabs: [...this.snapshot.tabs, ...fresh], active: this.snapshot.active })
  }

  activate(id: string): void {
    if (!this.snapshot.tabs.some(tab => tab.id === id)) return
    // A chat asked for from the left panel or History shows in the base tab when it has no tab of its own: its x is undone.
    this.set({ ...this.snapshot, active: id, ...(id === CHAT.id ? { baseClosed: false } : {}) })
  }

  /** The id of the tab that shows a chat: its own when it has one, else the base chat tab. */
  chatTabId(session: string): string {
    return this.snapshot.tabs.find(tab => tab.kind === 'chat' && tab.session === session)?.id ?? 'chat'
  }

  /**
   * Close a tab; the one before it is shown when it was. The base chat tab closes like any other (its chat is closed by the panel, and the tab
   * returns when a chat is opened again). @returns the closed tab.
   */
  close(id: string): FrameTab | undefined {
    const index = this.snapshot.tabs.findIndex(tab => tab.id === id)
    const tab = this.snapshot.tabs[index]
    if (tab === undefined) return undefined
    const baseClosed = this.snapshot.baseClosed === true
    const stays = (candidate: FrameTab | undefined): candidate is FrameTab => candidate !== undefined && !(isBase(candidate) && baseClosed)
    if (isBase(tab)) {
      if (baseClosed) return undefined
      const rest = this.snapshot.tabs.filter(existing => !isBase(existing))
      const active = this.snapshot.active === tab.id ? (rest[0]?.id ?? '') : this.snapshot.active
      this.set({ tabs: this.snapshot.tabs, active, baseClosed: true })
      return tab
    }
    const tabs = this.snapshot.tabs.filter(existing => existing.id !== id)
    // The tab before the closed one, else the one after: never the base chat's hidden tab.
    const before = this.snapshot.tabs.slice(0, index).reverse().find(stays)
    const after = this.snapshot.tabs.slice(index + 1).find(stays)
    const active = this.snapshot.active === id ? (before?.id ?? after?.id ?? '') : this.snapshot.active
    this.set({ tabs, active })
    return tab
  }

  /** Close the chat tabs of chats that are not open (a chat closed on another page, or before this strip was remembered). @returns whether any closed. */
  closeChatsNotIn(open: ReadonlySet<string>): boolean {
    const tabs = this.snapshot.tabs.filter(tab => tab.kind !== 'chat' || tab.session === undefined || open.has(tab.session))
    if (tabs.length === this.snapshot.tabs.length) return false
    const active = tabs.some(tab => tab.id === this.snapshot.active) ? this.snapshot.active : CHAT.id
    this.set({ tabs, active })
    return true
  }

  /** A terminal's program set its title; remembered with the strip, so the row still says what ran there after a reload or a Host restart. */
  setTitle(terminalId: string, title: string): void {
    if (this.snapshot.titles?.[terminalId] === title) return
    this.set({ ...this.snapshot, titles: { ...this.snapshot.titles, [terminalId]: title } })
  }

  private set(next: FrameTabsSnapshot): void {
    // A call that says nothing about titles keeps the ones already there; a closed terminal's title goes with its tab, and the same map comes back
    // when nothing changed, so an unchanged strip stays quiet.
    const titles = keptTitles(next.titles ?? this.snapshot.titles, next.tabs)
    const baseClosed = next.baseClosed ?? this.snapshot.baseClosed ?? false
    if (next.active === this.snapshot.active && next.tabs === this.snapshot.tabs && titles === this.snapshot.titles && baseClosed === (this.snapshot.baseClosed === true)) return
    this.snapshot = {
      tabs: next.tabs,
      active: next.active,
      ...(baseClosed ? { baseClosed: true } : {}),
      ...(titles === undefined ? {} : { titles }),
    }
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ tabs: next.tabs, active: next.active, branched: this.branched, ...(baseClosed ? { baseClosed: true } : {}), ...(titles === undefined ? {} : { titles }) }))
    } catch {
      // A blocked storage only forgets the strip for the next page.
    }
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * What a terminal row says it runs: the command a shell put in its title (`npm test`); an idle prompt's `user@host:/path/app` title says only
 * the folder (`app`).
 */
export function terminalMeta(title: string | undefined): string {
  if (title === undefined) return ''
  const idle = /^[^@\s]+@[^:\s]+:\s*(.*)$/.exec(title.trim())
  if (idle === null) return title.trim()
  const path = (idle[1] as string).replace(/\/+$/, '')
  return path.slice(path.lastIndexOf('/') + 1) || path
}
