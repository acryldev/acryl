/**
 * Which branch each chat belongs to, and which chats are open, as the Host remembers them, and the frame's copy: the one source of truth for both.
 * DSH knows no branches. A chat is recorded once - when the frame makes it, or when it is first seen with a turn - and never moved by a later switch.
 * A chat is open while it has a tab or is on screen; the left panel lists only the open ones and the rest wait in the chat's History.
 */

import { FRAME_BRANCH_CHATS_PATH, parseBranchChats, type BranchChatsView } from '../contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface BranchChatsApi {
  /** The recorded map and open chats. @throws when the Host does not answer it. */
  read(): Promise<BranchChatsView>
  /** Record a chat's branch. @throws when the Host refuses it (the caller tries again later). */
  assign(id: string, branch: string): Promise<void>
  /** Open or close one chat. @throws when the Host refuses it. */
  setOpen(id: string, open: boolean): Promise<void>
  /** Decide which chats are open, when the Host has no decision yet. @throws when the Host refuses it. */
  initOpen(ids: readonly string[]): Promise<void>
}

export function createBranchChatsApi(fetcher: FetchLike = (input, init) => fetch(input, init)): BranchChatsApi {
  const write = async (body: unknown, failure: string): Promise<void> => {
    const response = await fetcher(FRAME_BRANCH_CHATS_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${failure} (HTTP ${String(response.status)}).`)
  }
  return {
    async read() {
      const response = await fetcher(FRAME_BRANCH_CHATS_PATH, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`The branch chats could not be read (HTTP ${String(response.status)}).`)
      return parseBranchChats(await response.json())
    },
    assign: (id, branch) => write({ id, branch }, 'The chat could not be recorded'),
    setOpen: (id, open) => write({ id, open }, 'The chat could not be opened or closed'),
    initOpen: ids => write({ opened: [...ids] }, 'The open chats could not be recorded'),
  }
}

/** The map as the panels read it: a chat id to the branch it was opened on, and the chats that are open. */
export interface BranchChatsPort {
  getSnapshot(): Readonly<Record<string, string>>
  /** The chats that are open; empty until the Host's decision is known (`isOpenKnown`). */
  getOpen(): ReadonlySet<string>
  /** Whether the open chats are decided; until then every chat counts as open. */
  isOpenKnown(): boolean
  subscribe(listener: () => void): () => void
}

const NONE: ReadonlySet<string> = new Set()

export class BranchChatsStore implements BranchChatsPort {
  private chats: Readonly<Record<string, string>> = Object.freeze({})
  /** The open chats; undefined until the Host's list is read, and while the Host has none (nobody decided yet). */
  private open: ReadonlySet<string> | undefined
  private readonly pending = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private loaded = false

  constructor(private readonly api: BranchChatsApi) {}

  getSnapshot(): Readonly<Record<string, string>> {
    return this.chats
  }

  getOpen(): ReadonlySet<string> {
    return this.open ?? NONE
  }

  /** Whether the open chats are decided (by the Host's record, or by `initOpen`): until then the frame lists and opens nothing by it. */
  isOpenKnown(): boolean {
    return this.open !== undefined
  }

  isOpen(id: string): boolean {
    return this.open?.has(id) === true
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Whether the Host's map has been read: until then a chat that looks unrecorded may only be one the frame has not heard about. */
  isLoaded(): boolean {
    return this.loaded
  }

  /** Read what the Host remembers; a failed read keeps the map the frame has and is tried again by the next call. */
  async load(): Promise<void> {
    try {
      const recorded = await this.api.read()
      this.loaded = true
      // The Host's list wins over what this page decided before the read answered, except for chats opened or closed meanwhile (still being written).
      if (recorded.open !== null && this.open === undefined) this.open = new Set(recorded.open)
      this.publish({ ...this.chats, ...recorded.chats })
    } catch {
      // The Host answers again on the next page; until then a new chat is still put on its branch here.
    }
  }

  /**
   * Put every chat that is not recorded yet on `branch`, the checked-out one when it was first seen. The map shows the assignment at once (the
   * panel lists the chat under its branch while the Host write runs); a refused write is dropped so the next look tries again.
   */
  adopt(ids: readonly string[], branch: string): void {
    for (const id of ids) {
      if (this.chats[id] !== undefined || this.pending.has(id)) continue
      this.pending.add(id)
      this.publish({ ...this.chats, [id]: branch })
      void this.api.assign(id, branch).then(
        () => { this.pending.delete(id) },
        () => {
          this.pending.delete(id)
          if (this.chats[id] !== branch) return
          const next = { ...this.chats }
          delete next[id]
          this.publish(next)
        },
      )
    }
  }

  /**
   * Decide which chats are open, when the Host has no decision (and this page none): the set shows at once and is written once. A set already
   * known is kept, so a second page or a second call changes nothing.
   */
  initOpen(ids: readonly string[]): void {
    if (this.open !== undefined) return
    this.open = new Set(ids)
    this.publish(this.chats)
    void this.api.initOpen(ids).catch(() => {
      // The Host answers again on the next page; the choice stands on this one.
    })
  }

  /** Open or close one chat: shown at once, written to the Host; a write the Host refuses puts the chat back as it was. */
  setOpen(id: string, open: boolean): void {
    if (this.open === undefined || this.open.has(id) === open) return
    const next = new Set(this.open)
    if (open) next.add(id)
    else next.delete(id)
    this.open = next
    this.publish(this.chats)
    void this.api.setOpen(id, open).catch(() => {
      if (this.open === undefined || this.open.has(id) !== open) return
      const back = new Set(this.open)
      if (open) back.delete(id)
      else back.add(id)
      this.open = back
      this.publish(this.chats)
    })
  }

  private publish(next: Readonly<Record<string, string>>): void {
    this.chats = next === this.chats ? next : Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * Chat history as the History list shows it (mockup scenario 5): one group per branch, the checked-out branch first and the others by name,
 * each keeping the rows' own order; a chat no branch was recorded for yet comes last, under no name.
 */
export function historyGroups<Row extends { readonly id: string }>(
  rows: readonly Row[],
  assignments: Readonly<Record<string, string>>,
  checkedOut: string | undefined,
): { readonly branch: string | undefined; readonly rows: readonly Row[] }[] {
  const groups = new Map<string | undefined, Row[]>()
  for (const row of rows) {
    const branch = assignments[row.id]
    const group = groups.get(branch)
    if (group === undefined) groups.set(branch, [row])
    else group.push(row)
  }
  const rank = (branch: string | undefined): number => (branch === checkedOut ? 0 : branch === undefined ? 2 : 1)
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || (a ?? '').localeCompare(b ?? ''))
    .map(([branch, grouped]) => ({ branch, rows: grouped }))
}
