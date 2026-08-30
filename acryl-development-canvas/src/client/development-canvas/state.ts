/** In-memory Development Canvas tabs. Host PTY sessions bind through tab.sessionId. */

import type { CanvasPtyCommandId } from '../../canvas-pty-contract.ts'

export type CanvasTileKind = 'chat' | 'pty' | 'file' | 'browser'

export interface CanvasTile {
  readonly id: string
  readonly kind: CanvasTileKind
  readonly title: string
  readonly commandId?: CanvasPtyCommandId
  readonly sessionId?: string
  readonly path?: string
  readonly content?: string
  readonly url?: string
  readonly error?: string
}

export interface DevelopmentCanvasSnapshot {
  readonly tiles: readonly CanvasTile[]
  readonly activeId: string | undefined
  readonly menuOpen: boolean
}

export interface DevelopmentCanvasStateOptions {
  readonly createId?: () => string
}

export interface AddTileOptions {
  readonly commandId?: CanvasPtyCommandId
  readonly title?: string
}

const TITLES: Record<CanvasTileKind, string> = {
  chat: 'Chat',
  pty: 'Terminal',
  file: 'untitled',
  browser: 'Browser',
}

/**
 * Observable tab workspace for one advanced-shell lifetime.
 * One tab fills the main content area; "+" appends another tab.
 */
export class DevelopmentCanvasState {
  private snapshot: DevelopmentCanvasSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly createId: () => string

  constructor(options: DevelopmentCanvasStateOptions = {}) {
    this.createId = options.createId ?? (() => crypto.randomUUID())
    const chat = this.createTile('chat')
    this.snapshot = Object.freeze({
      tiles: Object.freeze([chat]),
      activeId: chat.id,
      menuOpen: false,
    })
  }

  /** @returns the immutable current canvas. */
  getSnapshot(): DevelopmentCanvasSnapshot {
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

  /** Focus one existing tab. */
  selectTile(id: string): void {
    if (this.snapshot.activeId === id) {
      if (this.snapshot.menuOpen) this.replace({ ...this.snapshot, menuOpen: false })
      return
    }
    if (!this.snapshot.tiles.some(tile => tile.id === id)) return
    this.replace({ ...this.snapshot, activeId: id, menuOpen: false })
  }

  /**
   * Append one tab and focus it. A second Chat tab is ignored.
   * @param kind - tab kind from the "+" menu.
   * @param options - PTY command / title overrides.
   */
  addTile(kind: CanvasTileKind, options: AddTileOptions = {}): CanvasTile | undefined {
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
   * Remove one tab. Caller disposes a Host PTY when `sessionId` was set.
   * @param id - tab id.
   */
  closeTile(id: string): CanvasTile | undefined {
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
   * Merge kind-specific fields onto one tab.
   * @param id - tab id.
   * @param patch - fields to replace.
   */
  updateTile(id: string, patch: Partial<Omit<CanvasTile, 'id' | 'kind'>>): void {
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

  private createTile(kind: CanvasTileKind, options: AddTileOptions = {}): CanvasTile {
    const tile: CanvasTile = {
      id: this.createId(),
      kind,
      title: options.title ?? TITLES[kind],
      ...(kind === 'pty' ? { commandId: options.commandId ?? 'shell' } : {}),
      ...(kind === 'file' ? { path: '', content: '' } : {}),
      ...(kind === 'browser' ? { url: 'https://example.com' } : {}),
    }
    return Object.freeze(tile)
  }

  private replace(snapshot: DevelopmentCanvasSnapshot): void {
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
