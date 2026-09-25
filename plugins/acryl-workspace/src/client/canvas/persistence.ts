/**
 * What survives a restart: the Chats | Projects choice and, per worktree, the tabs whose content
 * lives in the renderer (files, diffs, browser pages, docs, boards). Terminal and agent tabs are not
 * saved because their Host process ends with the app; the chat itself is the session's own record.
 *
 * Stored in the renderer's storage as a convenience, so every read is defensive: anything that does
 * not validate is dropped, never thrown, and never able to break startup.
 */

import type { KanbanBoard, KanbanCard, KanbanColumnId } from './state.ts'
import type { ShellMode } from '../worktrees/shell-state.ts'
import type { WorkspaceGroups } from './groups.ts'

export const STORAGE_KEY = 'acryl-workspace:v1'

const MAX_TEXT = 200_000
const MAX_TOTAL = 1_000_000
const MAX_GROUPS = 50
const MAX_TILES = 40
const RESTORABLE_KINDS = ['file', 'browser', 'diff', 'kanban', 'doc'] as const

export type SavedTileKind = (typeof RESTORABLE_KINDS)[number]

export interface SavedTile {
  readonly kind: SavedTileKind
  readonly title: string
  readonly path?: string
  readonly content?: string
  readonly url?: string
  readonly diffBefore?: string
  readonly diffAfter?: string
  readonly diffWorktree?: string
  readonly diffFile?: string
  readonly fileWorktree?: string
  readonly fileRel?: string
  readonly board?: KanbanBoard
  readonly docText?: string
}

export interface SavedGroup {
  readonly tiles: readonly SavedTile[]
  /** Index into `tiles` of the active tab, or -1 when the chat tab was active. */
  readonly active: number
  /** Index into `tiles` of the tab in the split pane, or -1 when there was no split. */
  readonly split: number
}

export interface SavedWorkspace {
  readonly version: 1
  readonly mode: ShellMode
  readonly groups: Readonly<Record<string, SavedGroup>>
}

/** The two methods of the Storage interface this module uses. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** @returns the page's localStorage, or undefined when it is blocked (private windows, policies). */
export function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_TEXT ? value : undefined
}

const COLUMNS: readonly KanbanColumnId[] = ['todo', 'doing', 'done']

function parseBoard(value: unknown): KanbanBoard | undefined {
  if (!isRecord(value)) return undefined
  const board: Record<KanbanColumnId, KanbanCard[]> = { todo: [], doing: [], done: [] }
  for (const column of COLUMNS) {
    const cards = value[column]
    if (!Array.isArray(cards)) return undefined
    for (const card of cards) {
      if (!isRecord(card)) return undefined
      const id = text(card.id)
      const cardText = text(card.text)
      if (id === undefined || cardText === undefined) return undefined
      board[column].push({ id, text: cardText })
    }
  }
  return board
}

function parseTile(value: unknown): SavedTile | undefined {
  if (!isRecord(value)) return undefined
  const kind = RESTORABLE_KINDS.find(candidate => candidate === value.kind)
  const title = text(value.title)
  if (kind === undefined || title === undefined) return undefined
  const tile: { -readonly [K in keyof SavedTile]: SavedTile[K] } = { kind, title }
  for (const key of ['path', 'content', 'url', 'diffBefore', 'diffAfter', 'diffWorktree', 'diffFile', 'fileWorktree', 'fileRel', 'docText'] as const) {
    const field = text(value[key])
    if (field !== undefined) tile[key] = field
  }
  if (value.board !== undefined) {
    const board = parseBoard(value.board)
    if (board === undefined) return undefined
    tile.board = board
  }
  // A git diff tile with only half of its identity cannot be shown; drop it rather than guess.
  if (kind === 'diff' && (tile.diffFile === undefined) !== (tile.diffWorktree === undefined)) return undefined
  if (kind === 'file' && (tile.fileRel === undefined) !== (tile.fileWorktree === undefined)) return undefined
  return tile
}

/**
 * @param raw - the stored string, or null.
 * @returns the saved state, or undefined when there is none or it does not validate.
 */
export function parseSavedWorkspace(raw: string | null): SavedWorkspace | undefined {
  if (raw === null || raw.length > MAX_TOTAL * 2) return undefined
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(value) || value.version !== 1 || (value.mode !== 'chats' && value.mode !== 'projects') || !isRecord(value.groups)) {
    return undefined
  }
  const groups: Record<string, SavedGroup> = {}
  for (const [key, group] of Object.entries(value.groups).slice(0, MAX_GROUPS)) {
    if (!isRecord(group) || !Array.isArray(group.tiles)) continue
    const tiles = group.tiles.slice(0, MAX_TILES).flatMap((entry) => {
      const tile = parseTile(entry)
      return tile === undefined ? [] : [tile]
    })
    const index = (candidate: unknown): number => (
      typeof candidate === 'number' && Number.isInteger(candidate) && candidate < tiles.length ? Math.max(-1, candidate) : -1
    )
    const active = index(group.active)
    const split = index(group.split)
    groups[key] = { tiles, active, split: split === active ? -1 : split }
  }
  return { version: 1, mode: value.mode, groups }
}

/** @returns the JSON to store, staying under the size cap by dropping the largest tiles first. */
export function serializeWorkspace(mode: ShellMode, groups: WorkspaceGroups): string {
  const saved: Record<string, SavedGroup> = {}
  for (const key of groups.keys()) {
    const snapshot = groups.stateFor(key).getSnapshot()
    const tiles: SavedTile[] = []
    let active = -1
    let split = -1
    for (const tile of snapshot.tiles) {
      const kind = RESTORABLE_KINDS.find(candidate => candidate === tile.kind)
      if (kind === undefined) continue
      const entry: { -readonly [K in keyof SavedTile]: SavedTile[K] } = { kind, title: tile.title }
      if (tile.path !== undefined) entry.path = tile.path
      // An editor tab remembers which file it shows; an unsaved draft is never written to storage.
      if (tile.content !== undefined && tile.fileRel === undefined) entry.content = tile.content
      if (tile.url !== undefined) entry.url = tile.url
      if (tile.diffBefore !== undefined) entry.diffBefore = tile.diffBefore
      if (tile.diffAfter !== undefined) entry.diffAfter = tile.diffAfter
      if (tile.diffWorktree !== undefined) entry.diffWorktree = tile.diffWorktree
      if (tile.diffFile !== undefined) entry.diffFile = tile.diffFile
      if (tile.fileWorktree !== undefined) entry.fileWorktree = tile.fileWorktree
      if (tile.fileRel !== undefined) entry.fileRel = tile.fileRel
      if (tile.board !== undefined) entry.board = tile.board
      if (tile.docText !== undefined) entry.docText = tile.docText
      if (tile.id === snapshot.activeId) active = tiles.length
      if (tile.id === snapshot.splitId) split = tiles.length
      tiles.push(entry)
    }
    if (tiles.length > 0 || active !== -1) saved[key] = { tiles: tiles.slice(0, MAX_TILES), active, split }
  }
  let json = JSON.stringify({ version: 1, mode, groups: saved })
  // Oversized text (a pasted file, a long doc) is the only thing that can blow the cap: shed it.
  if (json.length > MAX_TOTAL) {
    for (const group of Object.values(saved)) {
      group.tiles.forEach((tile, index) => {
        const mutable = tile as { -readonly [K in keyof SavedTile]: SavedTile[K] }
        if ((mutable.content?.length ?? 0) > 20_000) delete mutable.content
        if ((mutable.docText?.length ?? 0) > 20_000) delete mutable.docText
        void index
      })
    }
    json = JSON.stringify({ version: 1, mode, groups: saved })
  }
  return json
}
