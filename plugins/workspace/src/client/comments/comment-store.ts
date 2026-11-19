/**
 * The comments the user wrote on lines of files and has not used yet, per worktree. A comment stays here, and as a note under its lines,
 * until the user copies it, sends it to a terminal or agent, or closes it; it never goes anywhere by itself. Persisted in the renderer like
 * the tab layout, so a reload keeps them.
 */

import type { LineComment } from '../files/line-comment.ts'

export interface OpenComment extends LineComment {
  readonly id: string
  readonly createdAt: number
}

export const COMMENTS_STORAGE_KEY = 'acryl-workspace:comments:v1'
export const MAX_COMMENTS_PER_WORKTREE = 200
const MAX_TEXT = 4000
const MAX_LINES = 200

function isComment(value: unknown): value is OpenComment {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string'
    && typeof v.worktree === 'string'
    && typeof v.file === 'string'
    && typeof v.fromLine === 'number' && Number.isInteger(v.fromLine) && v.fromLine >= 1
    && typeof v.toLine === 'number' && Number.isInteger(v.toLine) && v.toLine >= v.fromLine
    && Array.isArray(v.lines) && v.lines.every(line => typeof line === 'string')
    && typeof v.text === 'string'
    && typeof v.createdAt === 'number' && Number.isFinite(v.createdAt)
}

/** Parse saved comments defensively: anything malformed is dropped, never thrown. */
export function parseSavedComments(raw: string | null | undefined): OpenComment[] {
  if (raw === null || raw === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(parsed) ? parsed.filter(isComment) : []
}

/** Files first by path, then by line: the order the Comments page lists them in, and "all comments" copies them in. */
function byPlace(a: OpenComment, b: OpenComment): number {
  return a.file === b.file ? a.fromLine - b.fromLine || a.createdAt - b.createdAt : a.file < b.file ? -1 : 1
}

export class CommentStore {
  private comments: OpenComment[]
  private version = 0
  private nextId = 1
  private readonly listeners = new Set<() => void>()

  constructor(saved: readonly OpenComment[] = [], private readonly clock: () => number = Date.now) {
    this.comments = [...saved]
    for (const comment of saved) {
      const n = Number(comment.id.replace(/^c/u, ''))
      if (Number.isInteger(n) && n >= this.nextId) this.nextId = n + 1
    }
  }

  /** @returns disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Changes on every mutation; a cheap snapshot for `useSyncExternalStore`. */
  getVersion(): number {
    return this.version
  }

  all(): readonly OpenComment[] {
    return this.comments
  }

  /** One worktree's comments, by file and line. */
  forWorktree(worktree: string): readonly OpenComment[] {
    return this.comments.filter(comment => comment.worktree === worktree).sort(byPlace)
  }

  forFile(worktree: string, file: string): readonly OpenComment[] {
    return this.comments.filter(comment => comment.worktree === worktree && comment.file === file)
  }

  add(input: LineComment): OpenComment {
    const comment: OpenComment = {
      worktree: input.worktree,
      file: input.file,
      fromLine: input.fromLine,
      toLine: input.toLine,
      lines: input.lines.slice(0, MAX_LINES).map(line => line.slice(0, MAX_TEXT)),
      text: input.text.slice(0, MAX_TEXT),
      id: `c${String(this.nextId)}`,
      createdAt: this.clock(),
    }
    this.nextId += 1
    const others = this.comments.filter(c => c.worktree !== input.worktree)
    const mine = [...this.comments.filter(c => c.worktree === input.worktree), comment].slice(-MAX_COMMENTS_PER_WORKTREE)
    this.comments = [...others, ...mine]
    this.changed()
    return comment
  }

  /** The lines moved (the file was edited above or inside them while it was open). */
  move(id: string, fromLine: number, toLine: number): void {
    const current = this.comments.find(comment => comment.id === id)
    if (current === undefined || (current.fromLine === fromLine && current.toLine === toLine) || fromLine < 1 || toLine < fromLine) return
    this.comments = this.comments.map(comment => comment.id === id ? { ...comment, fromLine, toLine } : comment)
    this.changed()
  }

  /** Used (copied or sent) or closed: the comments leave the list and their notes close. */
  remove(ids: readonly string[]): void {
    const gone = new Set(ids)
    if (!this.comments.some(comment => gone.has(comment.id))) return
    this.comments = this.comments.filter(comment => !gone.has(comment.id))
    this.changed()
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }
}

/** Save the store on every change. @returns a disposer that stops saving. */
export function startCommentPersistence(store: CommentStore, storage: Pick<Storage, 'setItem'> | undefined): () => void {
  if (storage === undefined) return () => {}
  return store.subscribe(() => {
    try {
      storage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(store.all()))
    } catch {
      // Storage can be blocked or full; the comments then last for this session only.
    }
  })
}
