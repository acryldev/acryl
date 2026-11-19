/**
 * The frame's auto-save: when the chat's agent finishes a turn that changed the app's files, the Host makes a save point (a version) by itself and
 * remembers which turn it belongs to, so the chat can say "edited src/routes.ts, src/board.ts · saved as v7" under that answer
 * (docs/design/blends-frame-mockup.html, scenario 2).
 *
 * The turn-end signal is DSH's own: its `workspace-changes` plugin diffs the working tree around every turn (the person's earlier unsaved edits never
 * enter a turn's list) and appends a `workspace/changes` session event only when files changed, so a turn that changed nothing makes no version here.
 * The Host hears that event on `session/event`, reads the turn's file list from `ctx.workspaceChanges.summary`, and saves through `acryl-versions`.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TurnSaveView } from './contract.ts'

/** The longest a version's name is, in characters, before it is cut at a word. */
const SUBJECT_LIMIT = 50
/** A request that says nothing nameable (an image, an empty line) is saved under this. */
const FALLBACK_SUBJECT = 'Changes from the chat'
/** How many saves the store keeps, oldest dropped first. */
const STORE_LIMIT = 2000

/** The person's request, shortened into a version's name: its first sentence or clause, one line, cut at a word. */
export function requestSubject(request: string | undefined, limit: number = SUBJECT_LIMIT): string {
  const line = (request ?? '').split('\n').map(part => part.trim()).find(part => part !== '') ?? ''
  const words = line.replace(/\s+/gu, ' ')
  const sentence = /^.*?[.!?](?=\s|$)/u.exec(words)?.[0].replace(/[.!?]+$/u, '') ?? words
  const clause = sentence.indexOf(', ')
  const head = clause >= 12 ? sentence.slice(0, clause) : sentence
  const trimmed = head.trim()
  if (trimmed === '') return FALLBACK_SUBJECT
  const cased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  if (cased.length <= limit) return cased
  const cut = cased.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/u, '')}…`
}

/** The text of a user message's blocks, in order; blocks that are not text (images) add nothing. */
export function messageText(data: unknown): string {
  const content = data !== null && typeof data === 'object' ? (data as { content?: unknown }).content : undefined
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((block: unknown) => {
      const text = block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text' ? (block as { text?: unknown }).text : undefined
      return typeof text === 'string' ? [text] : []
    })
    .join('\n')
}

/** What a chat's turn saved, kept in a file so the line under an answer is still there after a restart. */
export class SaveStore {
  private loaded: Map<string, TurnSaveView[]> | undefined
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly file: string, private readonly report: (cause: unknown) => void = () => {}) {}

  async forSession(session: string): Promise<readonly TurnSaveView[]> {
    return (await this.read()).get(session) ?? []
  }

  /** Remember a turn's save; a turn saved twice (its changes settled after the first record) keeps every file and the newer version. */
  async put(session: string, save: TurnSaveView): Promise<void> {
    const all = await this.read()
    const saves = all.get(session) ?? []
    const same = saves.find(entry => entry.turn === save.turn)
    const merged: TurnSaveView = same === undefined ? save : { ...save, files: [...new Set([...same.files, ...save.files])] }
    all.set(session, [...saves.filter(entry => entry.turn !== save.turn), merged].sort((a, b) => a.turn - b.turn))
    this.trim(all)
    await this.write(all)
  }

  private async read(): Promise<Map<string, TurnSaveView[]>> {
    if (this.loaded !== undefined) return this.loaded
    const all = new Map<string, TurnSaveView[]>()
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      if (parsed !== null && typeof parsed === 'object') {
        for (const [session, saves] of Object.entries(parsed)) if (Array.isArray(saves)) all.set(session, saves.filter(isSave))
      }
    } catch (cause) {
      // No file yet is the first run; an unreadable one starts the list again rather than stopping the saves.
      if ((cause as { code?: unknown }).code !== 'ENOENT') this.report(cause)
    }
    this.loaded = all
    return all
  }

  private trim(all: Map<string, TurnSaveView[]>): void {
    let total = [...all.values()].reduce((sum, saves) => sum + saves.length, 0)
    for (const [session, saves] of all) {
      if (total <= STORE_LIMIT) return
      const drop = Math.min(saves.length, total - STORE_LIMIT)
      saves.splice(0, drop)
      total -= drop
      if (saves.length === 0) all.delete(session)
    }
  }

  /** One write at a time, each to a new file renamed into place, so a crash leaves the old list or the new one. */
  private write(all: Map<string, TurnSaveView[]>): Promise<void> {
    const text = JSON.stringify(Object.fromEntries(all))
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const next = `${this.file}.tmp`
      await writeFile(next, text)
      await rename(next, this.file)
    }).catch((cause: unknown) => { this.report(cause) })
    return this.writing
  }
}

function isSave(value: unknown): value is TurnSaveView {
  if (value === null || typeof value !== 'object') return false
  const save = value as Partial<Record<keyof TurnSaveView, unknown>>
  return typeof save.turn === 'number' && Array.isArray(save.files) && save.files.every(file => typeof file === 'string')
    && typeof save.hash === 'string' && typeof save.version === 'number' && typeof save.subject === 'string'
}

/** A session event, as `session/event` carries it. */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

export interface AutoSaveDeps {
  /** The files a `workspace/changes` event of a session announced (`ctx.workspaceChanges.summary`); undefined when the Host no longer has it. */
  summary(session: string, seq: number): { readonly files: readonly { readonly display: string }[] } | undefined
  /** Save the app's files as a version called `message`; undefined when there was nothing to save. */
  save(message: string): Promise<{ readonly hash: string; readonly version: number; readonly subject: string } | undefined>
  readonly store: SaveStore
  readonly report: (cause: unknown) => void
}

/** Listens to the chat's session events and saves a version after each turn that changed files. */
export class AutoSave {
  private readonly turns = new Map<string, { turn: number; request: string | undefined }>()
  /** Saves run one after another: two chats finishing together must not commit over each other. */
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly deps: AutoSaveDeps) {}

  observe(session: string, event: SessionEventLike): void {
    if (event.type === 'turn/start') {
      const turn = (event.data as { turn?: unknown } | null)?.turn
      if (typeof turn === 'number') this.turns.set(session, { turn, request: undefined })
    } else if (event.type === 'user/message') {
      // The first message of the turn is what the person asked; a queued follow-up belongs to a turn of its own.
      const current = this.turns.get(session)
      if (current !== undefined && current.request === undefined) current.request = messageText(event.data)
    } else if (event.type === 'workspace/changes') {
      const turn = (event.data as { turn?: unknown } | null)?.turn
      if (typeof turn !== 'number') return
      const request = this.turns.get(session)?.turn === turn ? this.turns.get(session)?.request : undefined
      this.tail = this.tail.then(() => this.saveTurn(session, event.seq, turn, request)).catch((cause: unknown) => { this.deps.report(cause) })
    }
  }

  /** Resolves when every save queued so far has finished. */
  settled(): Promise<void> {
    return this.tail
  }

  private async saveTurn(session: string, seq: number, turn: number, request: string | undefined): Promise<void> {
    const files = this.deps.summary(session, seq)?.files.map(file => file.display) ?? []
    if (files.length === 0) return
    const saved = await this.deps.save(requestSubject(request))
    if (saved === undefined) return
    await this.deps.store.put(session, { turn, files, hash: saved.hash, version: saved.version, subject: saved.subject })
  }
}
