/** In-memory ACRYL Workspace tabs. Host PTY sessions bind through tile.sessionId. */

import type { WorkspacePtyCommandId } from '../../workspace-pty-contract.ts'

export type WorkspaceTileKind = 'chat' | 'pty' | 'file' | 'browser' | 'diff' | 'kanban' | 'doc'

export interface KanbanCard {
  readonly id: string
  readonly text: string
}

export type KanbanColumnId = 'todo' | 'doing' | 'done'

export type KanbanBoard = Readonly<Record<KanbanColumnId, readonly KanbanCard[]>>

export interface WorkspaceTile {
  readonly id: string
  readonly kind: WorkspaceTileKind
  readonly title: string
  readonly commandId?: WorkspacePtyCommandId
  readonly sessionId?: string
  readonly path?: string
  readonly content?: string
  readonly url?: string
  readonly error?: string
  /** diff tile: two texts compared line-by-line client-side (no external diff library - see spec 040 open question 5). */
  readonly diffBefore?: string
  readonly diffAfter?: string
  /** diff tile, git mode: the worktree and the file (relative to it) whose diff against HEAD is shown. */
  readonly diffWorktree?: string
  readonly diffFile?: string
  /** kanban tile: one local board per tile. */
  readonly board?: KanbanBoard
  /** doc tile: raw markdown-ish text, rendered with a minimal built-in formatter. */
  readonly docText?: string
}

export interface WorkspaceSnapshot {
  readonly tiles: readonly WorkspaceTile[]
  readonly activeId: string | undefined
  readonly menuOpen: boolean
}

export interface WorkspaceStateOptions {
  readonly createId?: () => string
}

export interface AddTileOptions {
  readonly commandId?: WorkspacePtyCommandId
  readonly title?: string
  readonly diffWorktree?: string
  readonly diffFile?: string
}

const TITLES: Record<WorkspaceTileKind, string> = {
  chat: 'Chat',
  pty: 'Terminal',
  file: 'untitled',
  browser: 'Browser',
  diff: 'Diff',
  kanban: 'Board',
  doc: 'Doc',
}

const EMPTY_BOARD: KanbanBoard = Object.freeze({ todo: [], doing: [], done: [] })

/**
 * Observable tab workspace for one advanced-shell lifetime.
 * One tile fills the main content area; "+" appends another tile.
 */
export class WorkspaceState {
  private snapshot: WorkspaceSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly createId: () => string

  constructor(options: WorkspaceStateOptions = {}) {
    this.createId = options.createId ?? (() => crypto.randomUUID())
    const chat = this.createTile('chat')
    this.snapshot = Object.freeze({
      tiles: Object.freeze([chat]),
      activeId: chat.id,
      menuOpen: false,
    })
  }

  /** @returns the immutable current workspace. */
  getSnapshot(): WorkspaceSnapshot {
    return this.snapshot
  }

  /** @param listener - notified after a snapshot replacement. @returns disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Open or close the "+" menu. */
  setMenuOpen(menuOpen: boolean): void {
    if (this.snapshot.menuOpen === menuOpen) return
    this.replace({ ...this.snapshot, menuOpen })
  }

  /** Focus one existing tile. */
  selectTile(id: string): void {
    if (this.snapshot.activeId === id) {
      if (this.snapshot.menuOpen) this.replace({ ...this.snapshot, menuOpen: false })
      return
    }
    if (!this.snapshot.tiles.some(tile => tile.id === id)) return
    this.replace({ ...this.snapshot, activeId: id, menuOpen: false })
  }

  /**
   * Append one tile and focus it. A second Chat tile is ignored (focuses the existing one instead).
   * @param kind - tile kind from the "+" menu.
   * @param options - PTY command / title overrides.
   */
  addTile(kind: WorkspaceTileKind, options: AddTileOptions = {}): WorkspaceTile | undefined {
    if (kind === 'chat' && this.snapshot.tiles.some(tile => tile.kind === 'chat')) {
      const existing = this.snapshot.tiles.find(tile => tile.kind === 'chat')
      this.replace({ ...this.snapshot, activeId: existing?.id, menuOpen: false })
      return undefined
    }
    const tile = this.createTile(kind, options)
    this.replace({
      tiles: Object.freeze([...this.snapshot.tiles, tile]),
      activeId: tile.id,
      menuOpen: false,
    })
    return tile
  }

  /**
   * Show one changed file's git diff: focus the tile already showing it, or open a new one.
   * @param worktree - absolute worktree path.
   * @param file - path relative to that worktree.
   */
  openDiff(worktree: string, file: string): WorkspaceTile | undefined {
    const existing = this.snapshot.tiles.find(
      tile => tile.kind === 'diff' && tile.diffWorktree === worktree && tile.diffFile === file,
    )
    if (existing !== undefined) {
      this.selectTile(existing.id)
      return existing
    }
    return this.addTile('diff', { title: basename(file), diffWorktree: worktree, diffFile: file })
  }

  /**
   * Remove one tile. Caller disposes a Host PTY when `sessionId` was set.
   * @param id - tile id.
   */
  closeTile(id: string): WorkspaceTile | undefined {
    const tiles = this.snapshot.tiles
    const index = tiles.findIndex(entry => entry.id === id)
    if (index < 0) return undefined
    const tile = tiles[index]
    const nextTiles = tiles.filter(entry => entry.id !== id)
    const nextActive = this.snapshot.activeId === id
      ? nextTiles[Math.max(0, index - 1)]?.id
      : this.snapshot.activeId
    this.replace({
      tiles: Object.freeze(nextTiles),
      activeId: nextActive,
      menuOpen: false,
    })
    return tile
  }

  /**
   * Merge kind-specific fields onto one tile.
   * @param id - tile id.
   * @param patch - fields to replace.
   */
  updateTile(id: string, patch: Partial<Omit<WorkspaceTile, 'id' | 'kind'>>): void {
    const tiles = this.snapshot.tiles.map((tile) => {
      if (tile.id !== id) return tile
      const next = { ...tile, ...patch, id: tile.id, kind: tile.kind }
      if (patch.path !== undefined && tile.kind === 'file' && patch.title === undefined) {
        next.title = basename(patch.path) || TITLES.file
      }
      if (patch.url !== undefined && tile.kind === 'browser' && patch.title === undefined) {
        next.title = hostname(patch.url) || TITLES.browser
      }
      return Object.freeze(next)
    })
    this.replace({ ...this.snapshot, tiles: Object.freeze(tiles) })
  }

  /** Move a kanban card between columns (or within one, at the given index). */
  moveCard(tileId: string, cardId: string, toColumn: KanbanColumnId, toIndex: number): void {
    const tile = this.snapshot.tiles.find(entry => entry.id === tileId)
    if (tile === undefined || tile.kind !== 'kanban') return
    const board = tile.board ?? EMPTY_BOARD
    let moving: KanbanCard | undefined
    const withoutCard: Record<KanbanColumnId, KanbanCard[]> = { todo: [], doing: [], done: [] }
    for (const column of Object.keys(board) as KanbanColumnId[]) {
      for (const card of board[column]) {
        if (card.id === cardId) { moving = card; continue }
        withoutCard[column].push(card)
      }
    }
    if (moving === undefined) return
    const target = [...withoutCard[toColumn]]
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, moving)
    withoutCard[toColumn] = target
    this.updateTile(tileId, { board: Object.freeze(withoutCard) })
  }

  /** Add a new kanban card to a column. */
  addCard(tileId: string, column: KanbanColumnId, text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    const tile = this.snapshot.tiles.find(entry => entry.id === tileId)
    if (tile === undefined || tile.kind !== 'kanban') return
    const board = tile.board ?? EMPTY_BOARD
    const card: KanbanCard = { id: this.createId(), text: trimmed }
    this.updateTile(tileId, {
      board: Object.freeze({ ...board, [column]: Object.freeze([...board[column], card]) }),
    })
  }

  private createTile(kind: WorkspaceTileKind, options: AddTileOptions = {}): WorkspaceTile {
    const tile: WorkspaceTile = {
      id: this.createId(),
      kind,
      title: options.title ?? TITLES[kind],
      ...(kind === 'pty' ? { commandId: options.commandId ?? 'shell' } : {}),
      ...(kind === 'file' ? { path: '', content: '' } : {}),
      ...(kind === 'browser' ? { url: 'https://example.com' } : {}),
      ...(kind === 'diff' && options.diffFile !== undefined && options.diffWorktree !== undefined
        ? { diffWorktree: options.diffWorktree, diffFile: options.diffFile }
        : {}),
      ...(kind === 'diff' && options.diffFile === undefined ? { diffBefore: '', diffAfter: '' } : {}),
      ...(kind === 'kanban' ? { board: EMPTY_BOARD } : {}),
      ...(kind === 'doc' ? { docText: '' } : {}),
    }
    return Object.freeze(tile)
  }

  private replace(snapshot: WorkspaceSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of this.listeners) listener()
  }
}

/** @param url - address-bar text. */
export function normalizeBrowserUrl(url: string): string | undefined {
  const trimmed = url.trim()
  if (trimmed.length === 0) return undefined
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

function basename(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
