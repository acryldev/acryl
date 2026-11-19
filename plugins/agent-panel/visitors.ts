/**
 * Who uses the panel, and what each one may do.
 *
 * - In development one person does, the app's owner: every page of the app shares one token and one run, so a run asked in the frame is followed from any tab of the app.
 * - As the Assistant every visitor of the app is their own: a visitor is known by an HttpOnly cookie that the panel's session sets, and has their own token, their own run and
 *   their own limits. A visitor never sees, follows or stops another visitor's run, and never waits for one.
 *
 * The Assistant spends the owner's model key for anyone who opens the app, so its asks are bounded: per visitor per hour, for all visitors per day, runs at once, and the length of
 * a question. The agent's own step budget bounds each run.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** The cookie that names a visitor of the Assistant. HttpOnly: the page's scripts never read it. */
export const VISITOR_COOKIE = 'acryl-visitor'

/** The Assistant's limits; each one has a default. */
export interface AssistantLimits {
  /** Questions one visitor may ask in an hour. */
  readonly perVisitorPerHour?: number
  /** Questions all visitors together may ask in a day: every one of them spends the owner's model key. */
  readonly perDay?: number
  /** Runs going at once, across visitors. */
  readonly concurrent?: number
  /** Characters in one question. */
  readonly messageLength?: number
}

export const DEFAULT_LIMITS: Required<AssistantLimits> = {
  perVisitorPerHour: 20,
  perDay: 300,
  concurrent: 4,
  messageLength: 1000,
}

/** The question length the development panel accepts (one person, who owns the key). */
const OWNER_MESSAGE_LENGTH = 8000
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** Visitors kept at most; the one seen longest ago without a run going is let go first. */
const DEFAULT_CAPACITY = 5000

/** What a visitor's run must say about itself. */
export interface RunState {
  readonly ended: boolean
}

export interface Visitor<R extends RunState> {
  readonly id: string
  readonly token: string
  /** The visitor in the audit: a short hash, never the cookie itself. */
  readonly tag: string
  /** The visitor's latest run, going or ended (what a page that loads shows again). */
  current: R | undefined
  /** When this visitor's asks of the last hour started. */
  readonly asks: number[]
  lastSeen: number
}

/** Why an ask is refused, with the HTTP status to answer. */
export interface Refusal {
  readonly error: string
  readonly status: 400 | 409 | 429 | 503
}

export interface VisitorsOptions {
  /** One visitor for every page (development); otherwise one per cookie (the Assistant). */
  readonly shared: boolean
  readonly limits?: AssistantLimits
  readonly now?: () => number
  readonly capacity?: number
}

const newSecret = (): string => randomBytes(24).toString('base64url')

/** The value of one cookie in a `Cookie` header. */
export function cookieValue(header: string | undefined | null, name: string): string | undefined {
  if (header === undefined || header === null) return undefined
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at === -1) continue
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return undefined
}

/** Whether two secrets are the same, in constant time. */
export function sameSecret(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string') return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const minutes = (ms: number): string => {
  const count = Math.max(1, Math.ceil(ms / 60_000))
  return `${String(count)} minute${count === 1 ? '' : 's'}`
}

export class Visitors<R extends RunState> {
  private readonly shared: boolean
  private readonly limits: Required<AssistantLimits>
  private readonly now: () => number
  private readonly capacity: number
  private readonly byId = new Map<string, Visitor<R>>()
  /** When every ask of the last day started, across visitors. */
  private readonly day: number[] = []
  private readonly owner: Visitor<R> | undefined

  constructor(options: VisitorsOptions) {
    this.shared = options.shared
    this.limits = { ...DEFAULT_LIMITS, ...options.limits }
    this.now = options.now ?? Date.now
    this.capacity = options.capacity ?? DEFAULT_CAPACITY
    this.owner = this.shared ? this.make() : undefined
  }

  /** The visitor a request belongs to: the owner in development, else the one its cookie names; `undefined` when it names none this app knows. */
  of(cookieHeader: string | undefined | null): Visitor<R> | undefined {
    if (this.owner !== undefined) return this.owner
    const id = cookieValue(cookieHeader, VISITOR_COOKIE)
    const visitor = id === undefined ? undefined : this.byId.get(id)
    if (visitor !== undefined) visitor.lastSeen = this.now()
    return visitor
  }

  /**
   * The visitor of a session request, made when the request names none. `setCookie` is the header to answer with, only for a new visitor: HttpOnly, SameSite=Strict, the whole
   * app (`Path=/`), a day long, and Secure when the page came over https.
   */
  session(
    cookieHeader: string | undefined | null,
    secure: boolean,
  ): { visitor: Visitor<R>; setCookie?: string } {
    const known = this.of(cookieHeader)
    if (known !== undefined) return { visitor: known }
    const visitor = this.make()
    this.keep(visitor)
    const setCookie = `${VISITOR_COOKIE}=${visitor.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(DAY_MS / 1000)}${secure ? '; Secure' : ''}`
    return { visitor, setCookie }
  }

  /** Whether `presented` is this visitor's token. */
  accepts(visitor: Visitor<R> | undefined, presented: unknown): visitor is Visitor<R> {
    return visitor !== undefined && sameSecret(presented, visitor.token)
  }

  /** Whether any visitor holds this token (a terminal driver checks a request with no other context). */
  knows(cookieHeader: string | undefined | null, presented: unknown): boolean {
    return this.accepts(this.of(cookieHeader), presented)
  }

  /** The question's length check, which comes before anything is counted. */
  checkMessage(message: string): Refusal | undefined {
    const most = this.shared ? OWNER_MESSAGE_LENGTH : this.limits.messageLength
    if (message === '' || message.length > most)
      return { error: `write a message of at most ${String(most)} characters`, status: 400 }
    return undefined
  }

  /**
   * Whether this visitor may start a run now. The visitor's own run going is refused first (409); then, for the Assistant, the visitor's hour, the runs going at once and the
   * day. An admitted ask is counted.
   */
  admit(visitor: Visitor<R>): Refusal | undefined {
    if (visitor.current !== undefined && !visitor.current.ended)
      return { error: 'a run is already going; wait for it to end', status: 409 }
    if (this.shared) return undefined
    const now = this.now()
    prune(visitor.asks, now - HOUR_MS)
    prune(this.day, now - DAY_MS)
    const hour = visitor.asks[0]
    if (visitor.asks.length >= this.limits.perVisitorPerHour && hour !== undefined)
      return {
        error: `You have asked ${String(this.limits.perVisitorPerHour)} questions this hour. Ask again in ${minutes(hour + HOUR_MS - now)}.`,
        status: 429,
      }
    let going = 0
    for (const other of this.byId.values())
      if (other.current !== undefined && !other.current.ended) going += 1
    if (going >= this.limits.concurrent)
      return {
        error: 'The assistant is helping other people right now. Ask again in a moment.',
        status: 503,
      }
    const first = this.day[0]
    if (this.day.length >= this.limits.perDay && first !== undefined)
      return {
        error: `The assistant has answered all the questions it can today. It is back in ${minutes(first + DAY_MS - now)}.`,
        status: 429,
      }
    visitor.asks.push(now)
    this.day.push(now)
    return undefined
  }

  /** How many visitors are kept (for tests and diagnostics). */
  get size(): number {
    return this.owner === undefined ? this.byId.size : 1
  }

  private make(): Visitor<R> {
    const id = newSecret()
    return {
      id,
      token: newSecret(),
      tag: createHash('sha256').update(id).digest('hex').slice(0, 12),
      current: undefined,
      asks: [],
      lastSeen: this.now(),
    }
  }

  /** Keep a new visitor; past the capacity, let go of the visitors seen longest ago that have no run going. */
  private keep(visitor: Visitor<R>): void {
    if (this.byId.size >= this.capacity) {
      const idle = [...this.byId.values()]
        .filter((other) => other.current === undefined || other.current.ended)
        .sort((a, b) => a.lastSeen - b.lastSeen)
      for (const other of idle.slice(0, this.byId.size - this.capacity + 1))
        this.byId.delete(other.id)
    }
    this.byId.set(visitor.id, visitor)
  }
}

/** Drop the times up to `since` from the front of an ascending list: an ask exactly an hour (or a day) old is out of the window. */
function prune(times: number[], since: number): void {
  let drop = 0
  while (drop < times.length && (times[drop] ?? 0) <= since) drop += 1
  if (drop > 0) times.splice(0, drop)
}
