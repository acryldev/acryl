/**
 * The collective app's showcase: every plugin in the app as a card (name, author, version, source, state, links to what it adds) at `/showcase`,
 * updated live as plugins are pulled and removed.
 *
 * A group pulls its members' plugins into one app (`plugin pull --from group.txt`); this page is where they see what the group made. It reads the
 * app's plugins through `pluginShare` (which knows where each pulled one came from), and follows `extensions/changed`: every install, update,
 * restore and removal goes through extensions, so one event covers them all. The stream's open connections end with the plugin.
 */
import type { Context } from '@deepseek-ai/cordis'
import { streamSSE } from '../acryl-router/src/helpers/index.ts'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../extensions/index.ts'
import type {} from '../plugin-share/index.ts'
import {
  appBase,
  type Offered,
  renderCards,
  renderPage,
  type ShowcaseCard,
  showcaseCards,
} from './cards.ts'

export type { ShowcaseCard } from './cards.ts'
export { appBase, renderCards, showcaseCards } from './cards.ts'

export const name = 'showcase'
export const inject = ['router', 'pluginShare']

/** A comment line this often keeps an idle stream open through proxies and browsers. */
const KEEP_ALIVE_MS = 15_000

/**
 * The names an optional service lists, or none when it is absent or is not the service the showcase knows. A name can be someone else's: in the
 * frame `tools` is the host's (the DSH harness's tool registry, with another shape), not the app's agent tools, so the shape is checked, not assumed.
 */
function namesOf(service: unknown, method: string, key: string): string[] {
  const list = (service as Record<string, unknown> | undefined)?.[method]
  if (typeof list !== 'function') return []
  let entries: unknown
  try {
    entries = (list as () => unknown).call(service)
  } catch {
    return []
  }
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry) => {
    const value = (entry as Record<string, unknown> | null)?.[key]
    return typeof value === 'string' ? [value] : []
  })
}

/** The optional services the cards link to, read where they are now: an app without an agent has no tools, one without a home page no widgets. */
function offered(ctx: Context): Offered {
  const get = ctx.get as (service: string) => unknown
  return {
    tools: namesOf(get('tools'), 'list', 'name'),
    widgets: namesOf(get('home'), 'widgets', 'id'),
  }
}

export function apply(ctx: Context): void {
  const cards = (): ShowcaseCard[] => showcaseCards(ctx.pluginShare.list(), offered(ctx))

  // The pages that follow the stream; each gets the cards again after every change, rendered for the path it is served at.
  const listeners = new Set<(now: readonly ShowcaseCard[]) => void>()
  const ends = new Set<() => void>()
  ctx.on('extensions/changed', () => {
    if (listeners.size === 0) return
    const now = cards()
    for (const listener of listeners) listener(now)
  })
  ctx.effect(
    () => () => {
      for (const end of ends) end()
    },
    'showcase: end the open streams',
  )

  const app = new Acryl()
    .get('/showcase', (c) =>
      c.html(renderPage(cards(), appBase(c.req.path)), 200, { 'cache-control': 'no-store' }),
    )
    .get('/showcase/plugins', (c) => c.json(cards(), 200, { 'cache-control': 'no-store' }))
    .get('/showcase/events', (c) =>
      streamSSE(c, async (stream) => {
        const base = appBase(c.req.path)
        let queue: Promise<unknown> = Promise.resolve()
        const send = (now: readonly ShowcaseCard[]): void => {
          queue = queue
            .then(() => stream.writeSSE({ event: 'cards', data: renderCards(now, base) }))
            .catch(() => undefined)
        }
        let finish = (): void => undefined
        const ended = new Promise<void>((resolve) => {
          finish = resolve
          stream.onAbort(resolve)
        })
        ends.add(finish)
        listeners.add(send)
        send(cards())
        const keepAlive = setInterval(() => {
          queue = queue.then(() => stream.write(': keepalive\n\n')).catch(() => undefined)
        }, KEEP_ALIVE_MS)
        keepAlive.unref()
        try {
          await ended
        } finally {
          clearInterval(keepAlive)
          listeners.delete(send)
          ends.delete(finish)
          await queue
        }
      }),
    )
  ctx.router.route('/', app)
}
