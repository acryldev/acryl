/**
 * The terminal dock's tabs for one worktree: a small list of shell terminals, one active, each bound to a Host
 * terminal. Observable and immutable-snapshot like the canvas state, and saved by the terminal's id so a reload
 * reattaches to the exact screen.
 */

import { normalizeTabTitle } from '../canvas/tab-title.ts'

export interface DockTab {
  readonly id: string
  readonly title: string
  /** The Host terminal this tab shows; absent while it is starting. */
  readonly terminalId?: string
  /** Why it could not start. */
  readonly error?: string
  /** The last title taken from the shell's own title, so a title the user typed is never overwritten. */
  readonly autoTitle?: string | undefined
}

export interface DockTabsSnapshot {
  readonly tabs: readonly DockTab[]
  readonly activeId: string | undefined
}

export const MAX_DOCK_TABS = 12
const DEFAULT_TITLE = 'Terminal'

export class DockTabsState {
  private snapshot: DockTabsSnapshot = Object.freeze({ tabs: Object.freeze([]), activeId: undefined })
  private readonly listeners = new Set<() => void>()

  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  getSnapshot = (): DockTabsSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the new tab, or undefined at the limit. Titles count up: Terminal, Terminal 2, Terminal 3. */
  add(): DockTab | undefined {
    if (this.snapshot.tabs.length >= MAX_DOCK_TABS) return undefined
    const tab: DockTab = Object.freeze({ id: this.createId(), title: this.nextTitle() })
    this.replace([...this.snapshot.tabs, tab], tab.id)
    return tab
  }

  select(id: string): void {
    if (this.snapshot.activeId === id || !this.snapshot.tabs.some(tab => tab.id === id)) return
    this.replace(this.snapshot.tabs, id)
  }

  update(id: string, patch: Partial<Omit<DockTab, 'id'>>): void {
    this.replace(this.snapshot.tabs.map(tab => (tab.id === id ? Object.freeze({ ...tab, ...patch }) : tab)), this.snapshot.activeId)
  }

  /** @returns the removed tab so the caller can end its terminal. The neighbour to the left becomes active. */
  close(id: string): DockTab | undefined {
    const index = this.snapshot.tabs.findIndex(tab => tab.id === id)
    if (index === -1) return undefined
    const removed = this.snapshot.tabs[index]
    const tabs = this.snapshot.tabs.filter(tab => tab.id !== id)
    const active = this.snapshot.activeId === id ? (tabs[Math.max(0, index - 1)]?.id) : this.snapshot.activeId
    this.replace(tabs, active)
    return removed
  }

  rename(id: string, raw: string): void {
    const tab = this.snapshot.tabs.find(candidate => candidate.id === id)
    if (tab === undefined) return
    // An empty name goes back to the tab's own default; the shell's title may then take over again.
    const next = normalizeTabTitle(raw)
    this.update(id, next === null ? { title: this.nextTitle(id), autoTitle: undefined } : { title: next })
  }

  /** A shell set its terminal's title: the tab follows it unless the user renamed the tab. @returns true when it changed. */
  applyTerminalTitle(terminalId: string, raw: string): boolean {
    const tab = this.snapshot.tabs.find(candidate => candidate.terminalId === terminalId)
    const next = normalizeTabTitle(raw)
    if (tab === undefined || next === null || next === tab.title) return false
    const untouched = tab.autoTitle === undefined ? /^Terminal( \d+)?$/.test(tab.title) : tab.title === tab.autoTitle
    if (!untouched) return false
    this.update(tab.id, { title: next, autoTitle: next })
    return true
  }

  /** Re-create tabs saved by a previous run. */
  restore(saved: readonly { readonly title: string; readonly terminalId: string }[], activeIndex: number): void {
    if (saved.length === 0) return
    const tabs = saved.slice(0, MAX_DOCK_TABS).map(entry => Object.freeze({ id: this.createId(), title: entry.title, terminalId: entry.terminalId }))
    this.replace(tabs, tabs[activeIndex]?.id ?? tabs[0]?.id)
  }

  private nextTitle(ignoring?: string): string {
    const taken = new Set(this.snapshot.tabs.filter(tab => tab.id !== ignoring).map(tab => tab.title))
    if (!taken.has(DEFAULT_TITLE)) return DEFAULT_TITLE
    for (let n = 2; ; n += 1) {
      const candidate = `${DEFAULT_TITLE} ${String(n)}`
      if (!taken.has(candidate)) return candidate
    }
  }

  private replace(tabs: readonly DockTab[], activeId: string | undefined): void {
    this.snapshot = Object.freeze({ tabs: Object.freeze([...tabs]), activeId })
    for (const listener of [...this.listeners]) listener()
  }
}

/** One dock tab list per worktree, created on first use and restored from what was saved. */
export class DockGroups {
  private readonly states = new Map<string, DockTabsState>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly saved: Readonly<Record<string, SavedDockGroup>> = {}, private readonly createId?: () => string) {}

  stateFor(key: string): DockTabsState {
    let state = this.states.get(key)
    if (state === undefined) {
      state = new DockTabsState(this.createId)
      const previous = this.saved[key]
      if (previous !== undefined) state.restore(previous.tabs, previous.active)
      this.states.set(key, state)
      state.subscribe(() => { this.notify() })
    }
    return state
  }

  keys(): readonly string[] {
    return [...this.states.keys()]
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

export interface SavedDockGroup {
  readonly tabs: readonly { readonly title: string; readonly terminalId: string }[]
  readonly active: number
}

const MAX_GROUPS = 50

/** @returns the tabs of every group that has a started terminal, as JSON-ready data. */
export function serializeDockGroups(groups: DockGroups): Record<string, SavedDockGroup> {
  const saved: Record<string, SavedDockGroup> = {}
  for (const key of groups.keys()) {
    const snapshot = groups.stateFor(key).getSnapshot()
    const tabs = snapshot.tabs.flatMap(tab => (tab.terminalId === undefined ? [] : [{ title: tab.title, terminalId: tab.terminalId }]))
    if (tabs.length === 0) continue
    const active = snapshot.tabs.filter(tab => tab.terminalId !== undefined).findIndex(tab => tab.id === snapshot.activeId)
    saved[key] = { tabs, active: Math.max(0, active) }
  }
  return saved
}

/** @param value - parsed JSON of unknown shape. Bad entries are dropped, never repaired. */
export function parseSavedDockGroups(value: unknown): Record<string, SavedDockGroup> {
  const out: Record<string, SavedDockGroup> = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  for (const [key, group] of Object.entries(value).slice(0, MAX_GROUPS)) {
    if (typeof group !== 'object' || group === null || !('tabs' in group) || !Array.isArray(group.tabs)) continue
    const tabs = group.tabs.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return []
      const title = 'title' in entry ? entry.title : undefined
      const terminalId = 'terminalId' in entry ? entry.terminalId : undefined
      return typeof title === 'string' && title.length <= 80 && typeof terminalId === 'string' && terminalId.length > 0 && terminalId.length <= 80 ? [{ title, terminalId }] : []
    }).slice(0, MAX_DOCK_TABS)
    const active = 'active' in group && typeof group.active === 'number' && Number.isInteger(group.active) ? group.active : 0
    if (tabs.length > 0) out[key] = { tabs, active }
  }
  return out
}
