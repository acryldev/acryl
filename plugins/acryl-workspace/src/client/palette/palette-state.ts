/**
 * The palette's open state, query, scope, selection and the asynchronous file results. Framework-free so its
 * rules are tested without a page: it asks two ports for items (the synchronous ones, and a file search) and
 * ignores the answer to any search that a newer query has replaced.
 */

import { rankItems, sectionsOf, type PaletteConfig, type PaletteItem, type PaletteSection } from './palette-items.ts'

/** Tab cycles through these: everything, commands only, file names, or file contents. */
export const PALETTE_SCOPES = ['all', 'commands', 'files', 'content'] as const
export type PaletteScope = (typeof PALETTE_SCOPES)[number]

export const SCOPE_LABELS: Readonly<Record<PaletteScope, string>> = { all: 'All', commands: 'Commands', files: 'Files', content: 'In files' }

/** Finds files for a query. Rejects (or aborts) on failure; the palette then shows no files rather than an error. */
export type FileSearch = (query: string, mode: 'name' | 'content', signal: AbortSignal) => Promise<readonly PaletteItem[]>

export interface PaletteSnapshot {
  readonly open: boolean
  readonly query: string
  readonly scope: PaletteScope
  readonly selected: number
  readonly sections: readonly PaletteSection[]
  /** The flat list the selection index refers to. */
  readonly flat: readonly PaletteItem[]
  readonly searching: boolean
}

export const MIN_FILE_QUERY = 2
export const FILE_DEBOUNCE_MS = 150

export interface PaletteStateOptions {
  readonly items: () => readonly PaletteItem[]
  readonly config: () => PaletteConfig
  readonly searchFiles: FileSearch
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

export class PaletteState {
  private open = false
  private query = ''
  private scope: PaletteScope = 'all'
  private selected = 0
  private fileItems: readonly PaletteItem[] = []
  private searching = false
  private timer: unknown
  private controller: AbortController | undefined
  private snapshot: PaletteSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(private readonly options: PaletteStateOptions) {
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
    this.clearTimer = options.clearTimer ?? (handle => { clearTimeout(handle as ReturnType<typeof setTimeout>) })
    this.snapshot = this.compute()
  }

  getSnapshot = (): PaletteSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggle(): void {
    if (this.open) this.close()
    else this.show()
  }

  show(): void {
    this.open = true
    this.query = ''
    this.scope = 'all'
    this.selected = 0
    this.fileItems = []
    this.publish()
  }

  close(): void {
    this.cancelSearch()
    this.open = false
    this.publish()
  }

  setQuery(query: string): void {
    this.query = query
    this.selected = 0
    this.scheduleFileSearch()
    this.publish()
  }

  /** Recompute after the items or the configuration changed underneath (a tab opened, a setting toggled). */
  refresh(): void {
    if (this.open) this.publish()
  }

  setScope(scope: PaletteScope): void {
    if (this.scope === scope) return
    this.scope = scope
    this.selected = 0
    this.scheduleFileSearch()
    this.publish()
  }

  cycleScope(step: 1 | -1 = 1): void {
    const index = PALETTE_SCOPES.indexOf(this.scope)
    this.scope = PALETTE_SCOPES[(index + step + PALETTE_SCOPES.length) % PALETTE_SCOPES.length] ?? 'all'
    this.selected = 0
    this.scheduleFileSearch()
    this.publish()
  }

  move(step: 1 | -1): void {
    const count = this.snapshot.flat.length
    if (count === 0) return
    this.selected = (this.selected + step + count) % count
    this.publish()
  }

  select(index: number): void {
    if (index < 0 || index >= this.snapshot.flat.length || index === this.selected) return
    this.selected = index
    this.publish()
  }

  /** Runs the selected item and closes the palette. */
  runSelected(): void {
    const item = this.snapshot.flat[this.selected]
    if (item === undefined) return
    this.close()
    item.run()
  }

  runAt(index: number): void {
    this.selected = index
    this.runSelected()
  }

  private wantsFiles(): boolean {
    return this.scope === 'files' || this.scope === 'content' || this.scope === 'all'
  }

  private scheduleFileSearch(): void {
    this.cancelSearch()
    this.fileItems = []
    const query = this.query.trim()
    if (!this.wantsFiles() || query.length < MIN_FILE_QUERY) return
    // The "all" scope searches names only; the content search is its own scope because it is the costly one.
    const mode = this.scope === 'content' ? 'content' : 'name'
    this.searching = true
    this.timer = this.setTimer(() => {
      const controller = new AbortController()
      this.controller = controller
      this.options.searchFiles(query, mode, controller.signal).then(
        (items) => { if (this.controller === controller) { this.fileItems = items; this.controller = undefined; this.searching = false; this.selectedClamp(); this.publish() } },
        () => { if (this.controller === controller) { this.fileItems = []; this.controller = undefined; this.searching = false; this.publish() } },
      )
    }, FILE_DEBOUNCE_MS)
  }

  private cancelSearch(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer)
    this.timer = undefined
    this.controller?.abort()
    this.controller = undefined
    this.searching = false
  }

  private selectedClamp(): void {
    const count = this.compute().flat.length
    if (this.selected >= count) this.selected = Math.max(0, count - 1)
  }

  private compute(): PaletteSnapshot {
    const config = this.options.config()
    const own = this.options.items().filter(item => (this.scope === 'commands' ? item.group !== 'file' : this.scope === 'all'))
    const files = this.scope === 'commands' ? [] : this.fileItems
    // File hits are already matched by the Host; ranking them again by name would drop content matches.
    const rankedOwn = this.scope === 'files' || this.scope === 'content' ? [] : rankItems(own, this.query, config)
    const visibleFiles = files.filter(item => !config.hiddenGroups.includes(item.group))
    const flat = [...rankedOwn, ...visibleFiles]
    const sections = sectionsOf(flat, this.query.trim() !== '')
    return { open: this.open, query: this.query, scope: this.scope, selected: Math.min(this.selected, Math.max(0, flat.length - 1)), sections, flat: sections.flatMap(section => section.items), searching: this.searching }
  }

  private publish(): void {
    this.snapshot = this.compute()
    for (const listener of [...this.listeners]) listener()
  }
}
