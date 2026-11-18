/**
 * Feedback from the people who use the app (docs/design/blends-frame-mockup.html, scenario 9): a Feedback button on every page of the app, in
 * production too. Pressing it turns a picker on: the person clicks the element where they hit a problem or had an idea, or chooses "Nothing
 * specific", writes a note and sends it. The notes are kept in the app's own data and read through the `feedback` service, which the ACRYL frame
 * shows in the builder's left panel ("Feedback from users"), where one click hands a note to an agent.
 *
 * - A middleware appends one script tag (`<mount>/api/feedback/feedback.js`) to every HTML response, so no page is edited (agent-panel's way).
 * - In the ACRYL frame's canvas the button follows the frame's view: Build hides it (the builder has its own left panel for notes), and Preview shows it as
 *   production does. A page opened directly keeps it on every page.
 * - `POST <mount>/api/feedback/notes` takes one note from the app's own page (same origin), at most 30 a minute across the app. The form offers
 *   "Attach a screenshot of this page" (checked) and says the browser will ask to share the tab; the page adds the tab capture with the picker's
 *   outline, downscaled and capped. Only Chromium is offered the option (Firefox and Safari ignore preferCurrentTab and would share the whole
 *   screen); unchecking it or a refused capture still sends the note.
 * - `GET <mount>/api/feedback/pins?page=...` answers the numbered badges a page draws on the elements people commented on (the mockup's
 *   production feedback): each selector with its number, and no note text, since anyone who opens the page can read this route.
 * - Nobody reads the notes over HTTP here: the builder reads them through the service. Opt-in: `acrylblends add feedback`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../instance/index.ts'
import {
  type FeedbackNote,
  FeedbackStore,
  LIMITS,
  parseNewNote,
  type StoredScreenshot,
} from './store.ts'

export type { FeedbackNote, FeedbackPin, PinnedElement } from './store.ts'

export const name = 'feedback'
export const inject = ['router', 'appInstance']

/** What the builder's tools read: every note, newest first, and marking notes seen. */
export interface Feedback {
  list(): Promise<FeedbackNote[]>
  markSeen(ids: readonly string[]): Promise<void>
  /** A note's screenshot, when it has one and the file is still there. */
  screenshot(id: string): Promise<StoredScreenshot | undefined>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    feedback: Feedback
  }
}

export interface FeedbackConfig {
  /** The URL prefix the app is mounted at: empty on the app's own server, `/app` when the ACRYL frame hosts it (agent-panel's `mount`). */
  mount?: string
}

const NOTES_PER_MINUTE = 30
const MOUNT = /^\/[A-Za-z0-9._~\-/]*[A-Za-z0-9._~-]$/u
const CLIENT = readFileSync(join(import.meta.dirname, 'client.js'), 'utf8')

/** A request from the app's own page: a browser sends Origin on a POST, and it must name this host. */
function fromOwnPage(headers: Headers): boolean {
  const origin = headers.get('origin')
  const host = headers.get('host')
  if (origin === null || host === null) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function apply(ctx: Context, config: FeedbackConfig = {}): void {
  const mount = config.mount ?? ''
  if (mount !== '' && !MOUNT.test(mount))
    throw new TypeError(
      `feedback: the app's mount "${mount}" must be empty or an absolute path such as "/app"`,
    )
  const FEEDBACK_PATH = '/api/feedback'
  const PREFIX = `${mount}${FEEDBACK_PATH}`
  // The routes mount at the app's own mount and keep the fixed feedback path inside (the frame's router prefixes the mount, not the routes).
  const APP_MOUNT = mount
  const store = new FeedbackStore(join(ctx.appInstance.home, 'feedback'))
  ctx.effect(
    () =>
      ctx.reflect.provide('feedback', {
        list: () => store.list(),
        markSeen: (ids) => store.markSeen(ids),
        screenshot: (id) => store.screenshot(id),
      } satisfies Feedback),
    'feedback: service',
  )

  const tag = `<script type="module" src="${PREFIX}/feedback.js"></script>`
  const addScript = async (c: { res: Response }, next: () => Promise<void>): Promise<void> => {
    await next()
    if (!(c.res.headers.get('content-type') ?? '').includes('text/html')) return
    const html = await c.res.text()
    const headers = new Headers(c.res.headers)
    headers.delete('content-length')
    const body = html.includes(`${PREFIX}/feedback.js`)
      ? html
      : html.includes('</body>')
        ? html.replace('</body>', `${tag}</body>`)
        : html + tag
    c.res = new Response(body, { status: c.res.status, headers })
  }
  const router = ctx.router as unknown as { wrap?: (middleware: typeof addScript) => unknown }
  const wrapped = typeof router.wrap === 'function'
  if (wrapped) router.wrap?.(addScript)

  const sent: number[] = []
  const app = new Acryl()
    .use('*', async (c, next) => {
      if (wrapped) return next()
      await addScript(c, next)
    })
    .get(`${FEEDBACK_PATH}/feedback.js`, (c) =>
      c.body(`${CLIENT}\nstart(${JSON.stringify(PREFIX)})\n`, 200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      }),
    )
    .get(`${FEEDBACK_PATH}/pins`, async (c) => {
      const page = c.req.query('page')
      if (typeof page !== 'string' || !page.startsWith('/') || page.length > LIMITS.page)
        return c.json({ error: 'the page must be a path' }, 400)
      // The page's visitors can read this route: it says where the commented elements are and nothing the notes say.
      return c.json({ pins: await store.pins(page) }, 200, { 'cache-control': 'no-store' })
    })
    .post(`${FEEDBACK_PATH}/notes`, async (c) => {
      if (!fromOwnPage(c.req.raw.headers))
        return c.json({ error: "only the app's own page may send feedback" }, 403)
      const now = Date.now()
      while (sent.length > 0 && (sent[0] as number) < now - 60_000) sent.shift()
      if (sent.length >= NOTES_PER_MINUTE)
        return c.json({ error: 'too much feedback at once; try again in a minute' }, 429)
      const note = parseNewNote(await c.req.json().catch(() => undefined))
      if (typeof note === 'string') return c.json({ error: note }, 400)
      sent.push(now)
      const stored = await store.add(note)
      return c.json({ id: stored.id }, 201)
    })
  ctx.router.route(APP_MOUNT === '' ? '/' : APP_MOUNT, app)
}
