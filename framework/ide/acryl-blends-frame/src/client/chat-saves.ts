/**
 * What each chat turn saved (the Host's auto-save, `../auto-save.ts`): the line under an answer, "edited src/routes.ts, src/board.ts · saved as v7".
 * The Host makes the version a moment after the turn ends, so a turn that has just closed asks again a few times before it concludes there was none.
 */

import { FRAME_CHAT_SAVES_PATH, parseChatSaves, type TurnSaveView } from '../contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ChatSavesApi {
  read(session: string): Promise<readonly TurnSaveView[]>
}

export function createChatSavesApi(fetcher: FetchLike = (input, init) => fetch(input, init)): ChatSavesApi {
  return {
    async read(session) {
      const response = await fetcher(`${FRAME_CHAT_SAVES_PATH}?session=${encodeURIComponent(session)}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`the saves could not be read (HTTP ${String(response.status)})`)
      return parseChatSaves(await response.json()).saves
    },
  }
}

/** How many files the line names before it says "and N more". */
const FILES_NAMED = 3

/** "edited src/routes.ts, src/board.ts · saved as v7". */
export function saveLine(save: Pick<TurnSaveView, 'files' | 'version'>): string {
  const named = save.files.slice(0, FILES_NAMED).join(', ')
  const more = save.files.length - FILES_NAMED
  return `edited ${named}${more > 0 ? ` and ${String(more)} more` : ''} · saved as v${String(save.version)}`
}

/** When a closed turn with no save yet asks again, after these many milliseconds each: the version lands a moment after the turn's last event. */
export const SAVE_RETRY_MS: readonly number[] = [400, 1200, 3000, 6000]

const NONE: readonly TurnSaveView[] = Object.freeze([])

export class ChatSavesStore {
  private readonly saves = new Map<string, readonly TurnSaveView[]>()
  private readonly asked = new Map<string, Promise<void>>()
  private readonly listeners = new Set<() => void>()

  /** `onSaved` is told when a read brings a save the page had not seen: the versions and the unsaved count have changed with it. */
  constructor(private readonly api: ChatSavesApi, private readonly onSaved: () => void = () => {}) {}

  getSnapshot(session: string): readonly TurnSaveView[] {
    return this.saves.get(session) ?? NONE
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Read the chat's saves; reads that overlap share one request. A failed read keeps what was shown. */
  refresh(session: string): Promise<void> {
    const running = this.asked.get(session)
    if (running !== undefined) return running
    const request = this.api.read(session).then((next) => {
      const before = this.getSnapshot(session)
      if (JSON.stringify(before) === JSON.stringify(next)) return
      this.saves.set(session, Object.freeze([...next]))
      if (next.length > before.length) this.onSaved()
      for (const listener of [...this.listeners]) listener()
    }, () => {}).finally(() => { this.asked.delete(session) })
    this.asked.set(session, request)
    return request
  }
}
