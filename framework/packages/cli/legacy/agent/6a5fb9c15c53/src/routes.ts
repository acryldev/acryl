import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { bodyLimit } from '../plugins/acryl-router/src/middleware/index.ts'
import type {} from '../plugins/agent/index.ts'
import type {} from '../plugins/extensions/index.ts'
import type {} from '../plugins/tasks/index.ts'

export const APP_NAME = '__APP_NAME__'

/** The door's page script (`.acryl/bin/acryl look` and `act`), in development only: `src/app.ts` leaves the door out in production and with ACRYL_DOOR=off. */
const DOOR_TAG =
  process.env.NODE_ENV !== 'production' && process.env.ACRYL_DOOR !== 'off'
    ? '<script type="module" src="/api/acryl-door/page.js"></script>'
    : ''

/**
 * The app's own routes on the router. Always: the page and `GET /health`. While the agent, the extensions and the task recorder run: `POST /ask` for the agent; `GET /extensions`
 * (and `POST /extensions/approve` and `/deny`) and `GET /tasks` to observe and steer what it did (every run is a durable task owning one task per tool call); `POST /tasks/cancel`.
 * What changes is also streamed: `GET /api/state/tasks/events` and `GET /api/state/extensions/events`. In production `src/app.ts` leaves the agent, builder and extensions rows
 * out (unless `ACRYL_PRODUCTION_KEEP` names them), and then those routes are not mounted at all. The mounts are removed when the plugin is disposed.
 */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context) {
    // A body here is a name, an id or a question; anything bigger is refused before it is read.
    const json = async (c: {
      req: { json(): Promise<unknown> }
    }): Promise<Record<string, unknown>> => {
      const body = await c.req.json().catch(() => undefined)
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    }
    const limit = bodyLimit({ maxSize: 64 * 1024 })
    const base = new Acryl()
      .use(limit)
      // A browser gets a page (the door's and the agent panel's script tags are added where they are mounted); everything else gets the JSON.
      .get('/', (c) =>
        (c.req.header('accept') ?? '').includes('text/html')
          ? c.html(
              `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${APP_NAME}</title></head><body><h1>${APP_NAME}</h1><p>This app runs an agent unless it is switched off (production switches it off, see ACRYL_PRODUCTION_KEEP in AGENTS.md). Ask it for a feature (<code>POST /ask</code>), or add the chat panel with <code>npx acrylblends add agent-panel</code>.</p>${DOOR_TAG}</body></html>`,
            )
          : c.json({ app: APP_NAME, ok: true }),
      )
      .get('/health', (c) => c.json({ ok: true }))
    ctx.router.route('/', base)
    // The routes that give a visitor the agent: mounted only while the agent, the extensions and the tasks run (see the header).
    ctx.inject(['agent', 'extensions', 'tasks'], (inner) => {
      const app = new Acryl().use(limit).get('/extensions', (c) =>
        c.json({
          installed: inner.extensions.list(),
          notInstalled: inner.extensions.pending(),
          waitingForApproval: inner.extensions.approvals(),
        }),
      )
      // The owner's decision on an install that is waiting (the `approval` parameter in blend.yaml).
      for (const [path, decide] of [
        ['/extensions/approve', (name: string) => inner.extensions.approve(name)],
        ['/extensions/deny', (name: string) => inner.extensions.deny(name)],
      ] as const) {
        app.post(path, async (c) => {
          const { name } = await json(c)
          if (typeof name !== 'string') return c.json({ error: 'name must be a string' }, 400)
          return c.json(await decide(name))
        })
      }
      app
        .get('/tasks', (c) => c.json(inner.tasks.list().slice(0, 100)))
        .post('/tasks/cancel', async (c) => {
          const { id } = await json(c)
          if (typeof id !== 'string' || !inner.tasks.get(id))
            return c.json({ error: 'no such task' }, 404)
          return c.json({ cancelled: inner.tasks.cancel(id) })
        })
        .post('/ask', async (c) => {
          const { question } = await json(c)
          if (typeof question !== 'string')
            return c.json({ error: 'question must be a string' }, 400)
          return c.json(await inner.agent.run(question))
        })
      inner.router.route('/', app)
    })
  },
}
