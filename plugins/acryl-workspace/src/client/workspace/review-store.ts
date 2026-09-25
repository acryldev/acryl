/**
 * The record of line comments the user sent to the agent, per worktree, so a Review tab can list
 * them and track which are resolved. The comment itself is durable in the chat session log; this
 * store only remembers the reviewer's own bookkeeping (what was raised, what is done), and is
 * persisted in the renderer like the tab layout.
 */

import type { CommentSide } from './comment-message.ts'

export interface ReviewThread {
  readonly id: string
  /** Absolute worktree path the comment belongs to. */
  readonly worktree: string
  readonly file: string
  readonly side: CommentSide
  readonly line: number
  /** The diff line the comment was made on, without its marker. */
  readonly lineText: string
  readonly comment: string
  readonly sentAt: number
  readonly resolved: boolean
}

export type NewReviewThread = Omit<ReviewThread, 'id' | 'sentAt' | 'resolved'>

export const REVIEW_STORAGE_KEY = 'acryl-workspace:review:v1'
export const MAX_THREADS_PER_WORKTREE = 200
const MAX_TEXT = 4000

function isThread(value: unknown): value is ReviewThread {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string'
    && typeof v.worktree === 'string'
    && typeof v.file === 'string'
    && (v.side === 'old' || v.side === 'new')
    && typeof v.line === 'number' && Number.isInteger(v.line) && v.line >= 0
    && typeof v.lineText === 'string'
    && typeof v.comment === 'string'
    && typeof v.sentAt === 'number' && Number.isFinite(v.sentAt)
    && typeof v.resolved === 'boolean'
}

/** Parse saved threads defensively: anything malformed is dropped, never thrown. */
export function parseSavedThreads(raw: string | null | undefined): ReviewThread[] {
  if (raw === null || raw === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isThread)
}

export class ReviewStore {
  private threads: ReviewThread[]
  private version = 0
  private nextId = 1
  private readonly listeners = new Set<() => void>()

  constructor(
    saved: readonly ReviewThread[] = [],
    private readonly clock: () => number = Date.now,
  ) {
    this.threads = [...saved]
    for (const thread of saved) {
      const n = Number(thread.id.replace(/^r/, ''))
      if (Number.isInteger(n) && n >= this.nextId) this.nextId = n + 1
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Changes on every mutation; a cheap snapshot for `useSyncExternalStore`. */
  getVersion(): number {
    return this.version
  }

  all(): readonly ReviewThread[] {
    return this.threads
  }

  forWorktree(worktree: string): readonly ReviewThread[] {
    return this.threads.filter(thread => thread.worktree === worktree)
  }

  add(input: NewReviewThread): ReviewThread {
    const thread: ReviewThread = {
      ...input,
      lineText: input.lineText.slice(0, MAX_TEXT),
      comment: input.comment.slice(0, MAX_TEXT),
      id: `r${String(this.nextId)}`,
      sentAt: this.clock(),
      resolved: false,
    }
    this.nextId += 1
    const others = this.threads.filter(t => t.worktree !== input.worktree)
    const mine = [...this.threads.filter(t => t.worktree === input.worktree), thread].slice(-MAX_THREADS_PER_WORKTREE)
    this.threads = [...others, ...mine]
    this.changed()
    return thread
  }

  setResolved(id: string, resolved: boolean): void {
    if (!this.threads.some(thread => thread.id === id && thread.resolved !== resolved)) return
    this.threads = this.threads.map(thread => thread.id === id ? { ...thread, resolved } : thread)
    this.changed()
  }

  remove(id: string): void {
    if (!this.threads.some(thread => thread.id === id)) return
    this.threads = this.threads.filter(thread => thread.id !== id)
    this.changed()
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }
}

/** Save the store on every change. @returns a disposer that stops saving. */
export function startReviewPersistence(
  store: ReviewStore,
  storage: Pick<Storage, 'setItem'> | undefined,
): () => void {
  if (storage === undefined) return () => {}
  return store.subscribe(() => {
    try {
      storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(store.all()))
    } catch {
      // Storage can be blocked or full; the threads then last for this session only.
    }
  })
}
