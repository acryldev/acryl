/**
 * The terminal dock as one object the frame, the canvas and the palette share: the layout preferences, the
 * per-worktree terminal tabs, and everything that keeps their terminals honest (starting one, closing one,
 * keeping every stream alive while its panel is hidden, dropping a tab whose terminal the Host lost, naming a tab
 * from its shell). Created once at the composition root so the canvas's own terminals and the dock's share one
 * registry.
 */

import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import type { TerminalSize, WorkspacePtyApi } from '../terminal/pty-api.ts'
import {
  clampBottomHeight, clampStackedRatio, nextMode, parseDockPrefs,
  type DockMode, type DockPrefs, type SideView,
} from './dock-model.ts'
import { DockGroups, parseSavedDockGroups, serializeDockGroups } from './dock-tabs.ts'

export const DOCK_STORAGE_KEY = 'acryl-workspace:dock'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export interface DockControllerDeps {
  readonly api: WorkspacePtyApi
  readonly terminals: TerminalRegistry
  /** Undefined when browser storage is blocked; the dock then simply is not remembered. */
  readonly storage: StorageLike | undefined
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

export class DockController {
  readonly groups: DockGroups
  private prefs: DockPrefs
  private readonly listeners = new Set<() => void>()
  private saveTimer: unknown
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(private readonly deps: DockControllerDeps) {
    this.setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
    this.clearTimer = deps.clearTimer ?? (handle => { clearTimeout(handle as ReturnType<typeof setTimeout>) })
    let raw: unknown = null
    try {
      const text = deps.storage?.getItem(DOCK_STORAGE_KEY)
      raw = text === null || text === undefined ? null : JSON.parse(text)
    } catch {
      raw = null
    }
    const saved = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    this.prefs = parseDockPrefs(saved.prefs)
    this.groups = new DockGroups(parseSavedDockGroups(saved.groups))
  }

  getPrefs = (): DockPrefs => this.prefs

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setOpen(open: boolean): void {
    if (open === this.prefs.open) return
    // Opening in side-by-side mode goes straight to the terminals: that is what the button was pressed for.
    this.update({ open, ...(open && this.prefs.mode === 'side' ? { sideView: 'terminals' as const } : {}) })
  }

  toggleOpen(): void {
    this.setOpen(!this.prefs.open)
  }

  setMode(mode: DockMode): void {
    this.update({ mode, ...(mode === 'side' && this.prefs.open ? { sideView: 'terminals' as const } : {}) })
  }

  cycleMode(): void {
    this.setMode(nextMode(this.prefs.mode))
  }

  setSideView(sideView: SideView): void {
    this.update({ sideView })
  }

  setStackedRatio(ratio: number): void {
    this.update({ stackedRatio: clampStackedRatio(ratio) })
  }

  setBottomHeight(height: number): void {
    this.update({ bottomHeight: clampBottomHeight(height) })
  }

  /**
   * Start a shell in the group's worktree as a new tab. The tab appears at once and gets its terminal when the
   * Host answers; a refusal is shown on the tab instead of being thrown.
   */
  async openTab(groupKey: string, cwd: string | undefined, size?: TerminalSize): Promise<void> {
    const state = this.groups.stateFor(groupKey)
    const tab = state.add()
    if (tab === undefined) return
    try {
      const view = await this.deps.api.start('shell', cwd, size)
      state.update(tab.id, { terminalId: view.id })
    } catch (cause) {
      state.update(tab.id, { error: cause instanceof Error ? cause.message : 'the terminal did not start' })
    }
  }

  /** Close a tab and end its terminal; a failing close is ignored (the Host may already have dropped it). */
  async closeTab(groupKey: string, tabId: string): Promise<void> {
    const removed = this.groups.stateFor(groupKey).close(tabId)
    if (removed?.terminalId === undefined) return
    this.deps.terminals.release(removed.terminalId)
    await this.deps.api.close(removed.terminalId).catch(() => {})
  }

  /**
   * Keep the dock's terminals alive and saved for as long as the caller wants (one owning effect).
   * @returns disposer; it writes what is pending before it returns.
   */
  connect(): () => void {
    const { terminals } = this.deps
    const ensureAll = (): void => {
      for (const key of this.groups.keys()) {
        for (const tab of this.groups.stateFor(key).getSnapshot().tabs) {
          if (tab.terminalId !== undefined) terminals.ensure(tab.terminalId)
        }
      }
    }
    ensureAll()
    const stopGroups = this.groups.onChange(() => { ensureAll(); this.scheduleSave() })
    const stopLost = terminals.onLost((terminalId) => {
      for (const key of this.groups.keys()) {
        const state = this.groups.stateFor(key)
        const tab = state.getSnapshot().tabs.find(candidate => candidate.terminalId === terminalId)
        if (tab === undefined) continue
        state.close(tab.id)
        terminals.release(terminalId)
        return
      }
    })
    const stopTitle = terminals.onTitle((terminalId, title) => {
      for (const key of this.groups.keys()) {
        if (this.groups.stateFor(key).applyTerminalTitle(terminalId, title)) return
      }
    })
    return () => {
      stopGroups()
      stopLost()
      stopTitle()
      this.flush()
    }
  }

  private update(patch: Partial<DockPrefs>): void {
    this.prefs = { ...this.prefs, ...patch }
    this.scheduleSave()
    for (const listener of [...this.listeners]) listener()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) this.clearTimer(this.saveTimer)
    this.saveTimer = this.setTimer(() => { this.flush() }, 300)
  }

  /** Write the layout and the tabs now. A blocked or full storage is ignored: this is a convenience. */
  flush(): void {
    if (this.saveTimer !== undefined) this.clearTimer(this.saveTimer)
    this.saveTimer = undefined
    try {
      this.deps.storage?.setItem(DOCK_STORAGE_KEY, JSON.stringify({ prefs: this.prefs, groups: serializeDockGroups(this.groups) }))
    } catch {
      // Not remembered.
    }
  }
}
