import { createHash, timingSafeEqual } from 'node:crypto'
import { connectionOf, createMiddleware } from '../plugins/acryl-router/src/helpers/index.ts'
import type { Context } from '../plugins/acryl-router/src/index.ts'
import { basicAuth } from '../plugins/acryl-router/src/middleware/index.ts'

/** Who may use the chat, and what the app prints about it at start. */
export type Access =
  /** Development, and every test: no gate. */
  | { kind: 'open' }
  /** Production with `ACRYL_PRODUCTION_KEEP=chat`: anyone, with a per-IP rate limit. */
  | { kind: 'public'; perMinute: number; trustProxy: boolean }
  /** Production with `CHAT_ACCESS_TOKEN`: the browser asks for it (any user name, the token as the password). */
  | { kind: 'token'; token: string }
  /** Production with neither: every route but `/health` answers 503. */
  | { kind: 'closed' }

export interface Decision {
  readonly access: Access
  /** Lines to print at start (a `WARNING` for a public chat, the reason for a closed one). */
  readonly notices: readonly string[]
}

/**
 * Anyone who can reach the chat spends the model key, so in production it is closed by default. Name the chat in `ACRYL_PRODUCTION_KEEP` to make it public
 * (loudly, with a rate limit), or set `CHAT_ACCESS_TOKEN` to ask for a shared token.
 */
export function chatAccess(env: Readonly<Record<string, string | undefined>>): Decision {
  if (env.NODE_ENV !== 'production') return { access: { kind: 'open' }, notices: [] }
  const keep = (env.ACRYL_PRODUCTION_KEEP ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (keep.includes('chat')) {
    const perMinute = Number(env.CHAT_RATE_PER_MINUTE)
    return {
      access: {
        kind: 'public',
        perMinute: Number.isInteger(perMinute) && perMinute > 0 ? perMinute : 20,
        trustProxy: env.TRUST_PROXY === '1',
      },
      notices: [
        'WARNING: the chat is public in production because ACRYL_PRODUCTION_KEEP names "chat": anyone who can reach it spends your model key (each address is limited to a few messages a minute). Put your own login in front of it, or set CHAT_ACCESS_TOKEN instead.',
      ],
    }
  }
  const token = env.CHAT_ACCESS_TOKEN?.trim()
  if (token) return { access: { kind: 'token', token }, notices: [] }
  return {
    access: { kind: 'closed' },
    notices: [
      'The chat is closed: with NODE_ENV=production it needs CHAT_ACCESS_TOKEN (the browser asks for it) or ACRYL_PRODUCTION_KEEP=chat to be public. Every route but /health answers 503 until then.',
    ],
  }
}

const digest = (text: string) => createHash('sha256').update(text).digest()

/** The middleware for an access mode, mounted before the routes. `/health` is always open. */
export function accessGate(access: Access) {
  if (access.kind === 'open') return undefined
  if (access.kind === 'closed')
    return createMiddleware(async (c, next) => {
      if (c.req.path === '/health') return next()
      return c.json(
        {
          error:
            'The chat is closed. Set CHAT_ACCESS_TOKEN, or ACRYL_PRODUCTION_KEEP=chat to make it public.',
        },
        503,
      )
    })
  if (access.kind === 'token') {
    const expected = digest(access.token)
    const ask = basicAuth({
      realm: 'chat',
      verifyUser: (_user, password) => timingSafeEqual(digest(password), expected),
    })
    return createMiddleware(async (c, next) => (c.req.path === '/health' ? next() : ask(c, next)))
  }
  return rateLimit(access.perMinute, access.trustProxy)
}

/** At most `perMinute` messages a minute from one address (`POST /api/chat`); the table forgets an address a minute after its last message. */
function rateLimit(perMinute: number, trustProxy: boolean) {
  const seen = new Map<string, number[]>()
  const addressOf = (c: Context) => {
    if (trustProxy) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
      if (forwarded) return forwarded
    }
    return connectionOf(c).remoteAddress ?? 'unknown'
  }
  return createMiddleware(async (c, next) => {
    if (c.req.method !== 'POST' || c.req.path !== '/api/chat') return next()
    const now = Date.now()
    for (const [address, times] of seen)
      if (now - (times.at(-1) ?? 0) > 60_000) seen.delete(address)
    const address = addressOf(c)
    const recent = (seen.get(address) ?? []).filter((time) => now - time < 60_000)
    if (recent.length >= perMinute) {
      seen.set(address, recent)
      const wait = Math.ceil((60_000 - (now - (recent[0] ?? now))) / 1000)
      c.header('retry-after', String(wait))
      return c.json({ error: 'Too many messages. Try again in a minute.' }, 429)
    }
    recent.push(now)
    seen.set(address, recent)
    return next()
  })
}
