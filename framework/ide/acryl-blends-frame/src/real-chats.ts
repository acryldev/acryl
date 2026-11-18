/**
 * Which chats are real, and what each is called. A chat is real when it has at least one turn. DSH's session list marks a chat `blank` only while it is
 * loaded and carries no title for one that is not, so the list alone cannot tell an old empty chat from a used one or name it; the Host reads each
 * session's log once for both: a `turn/start`, and the title (DSH's own `session/title` event, else the person's first message, cut short).
 * A chat with a title DSH or the person gave is final; one named from its first message is read again after a while, since DSH's title may follow.
 */

import { messageText, requestSubject } from './auto-save.ts'

/** The longest a chat's name is in the left panel, in characters, before it is cut at a word. */
export const CHAT_TITLE_LIMIT = 32

/** What the frame reads from a session log's events. */
export interface LogEvent {
  readonly type: string
  readonly data?: unknown
}

export interface ChatLook {
  readonly hasTurn: boolean
  /** The chat's name; undefined when the log has neither a title nor a user message. */
  readonly title: string | undefined
  /** True when DSH or the person named the chat (the title will not change by itself). */
  readonly named: boolean
}

export function lookAtLog(events: readonly LogEvent[]): ChatLook {
  const hasTurn = events.some(event => event.type === 'turn/start')
  let given: string | undefined
  for (const event of events) {
    if (event.type !== 'session/title') continue
    const title = (event.data as { title?: unknown } | null)?.title
    if (typeof title === 'string' && title.trim() !== '') given = title.trim()
  }
  if (given !== undefined) return { hasTurn, title: given, named: true }
  const first = events.find(event => event.type === 'user/message')
  const text = first === undefined ? '' : messageText(first.data).trim()
  return { hasTurn, title: text === '' ? undefined : requestSubject(text, CHAT_TITLE_LIMIT), named: false }
}

export interface RealChat {
  readonly id: string
  readonly title: string
}

export interface RealChatsDeps {
  /** The ids of every session DSH knows. */
  list(): Promise<readonly string[]>
  /** One read of the session's log. */
  look(id: string): Promise<ChatLook>
  readonly report?: (cause: unknown) => void
  /** How long a chat named from its first message waits before it is read again, in milliseconds. */
  readonly refreshMs?: number
  readonly now?: () => number
}

interface Known {
  readonly title: string
  readonly named: boolean
  readonly at: number
}

export class RealChats {
  private readonly known = new Map<string, Known>()

  constructor(private readonly deps: RealChatsDeps) {}

  /** The chats with a turn, in the order DSH lists them. A session that cannot be read is left out this time and asked again next time. */
  async read(): Promise<RealChat[]> {
    const now = (this.deps.now ?? Date.now)()
    const refreshMs = this.deps.refreshMs ?? 20_000
    const ids = await this.deps.list()
    const found = await Promise.all(ids.map(async (id): Promise<RealChat | undefined> => {
      const cached = this.known.get(id)
      if (cached !== undefined && (cached.named || now - cached.at < refreshMs)) return { id, title: cached.title }
      try {
        const look = await this.deps.look(id)
        if (!look.hasTurn) return undefined
        const title = look.title ?? cached?.title ?? 'Chat'
        this.known.set(id, { title, named: look.named, at: now })
        return { id, title }
      } catch (cause) {
        this.deps.report?.(cause)
        return cached === undefined ? undefined : { id, title: cached.title }
      }
    }))
    return found.filter((chat): chat is RealChat => chat !== undefined)
  }
}
