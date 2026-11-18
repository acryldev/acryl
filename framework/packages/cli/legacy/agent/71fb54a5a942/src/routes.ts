import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { bodyLimit } from '../plugins/acryl-router/src/middleware/index.ts'
import type {} from '../plugins/agent/index.ts'
import type {} from '../plugins/extensions/index.ts'
import type {} from '../plugins/tasks/index.ts'

export const APP_NAME = '__APP_NAME__'

/**
 * The app's own routes on the router: `POST /ask` for the agent; `GET /extensions` and `GET /tasks` to observe what it did (every run is a
 * durable task owning one task per tool call); `POST /tasks/cancel`. What changes is also streamed: `GET /api/state/tasks/events` and
 * `GET /api/state/extensions/events`. The mount is removed when the plugin is disposed.
 */
export const routes = {
  name: 'routes',
  inject: ['router', 'agent', 'extensions', 'tasks'],
  apply(ctx: Context) {
    // A body here is a name, an id or a question; anything bigger is refused before it is read.
    const json = async (c: {
      req: { json(): Promise<unknown> }
    }): Promise<Record<string, unknown>> => {
      const body = await c.req.json().catch(() => undefined)
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    }
    const app = new Acryl()
      .use(bodyLimit({ maxSize: 64 * 1024 }))
      .get('/', (c) => c.json({ app: APP_NAME, ok: true }))
      .get('/health', (c) => c.json({ ok: true }))
      .get('/extensions', (c) =>
        c.json({
          installed: ctx.extensions.list(),
          notInstalled: ctx.extensions.pending(),
          waitingForApproval: ctx.extensions.approvals(),
        }),
      )
    // The owner's decision on an install that is waiting (the `approval` parameter in blend.yaml).
    for (const [path, decide] of [
      ['/extensions/approve', (name: string) => ctx.extensions.approve(name)],
      ['/extensions/deny', (name: string) => ctx.extensions.deny(name)],
    ] as const) {
      app.post(path, async (c) => {
        const { name } = await json(c)
        if (typeof name !== 'string') return c.json({ error: 'name must be a string' }, 400)
        return c.json(await decide(name))
      })
    }
    app
      .get('/tasks', (c) => c.json(ctx.tasks.list().slice(0, 100)))
      .post('/tasks/cancel', async (c) => {
        const { id } = await json(c)
        if (typeof id !== 'string' || !ctx.tasks.get(id))
          return c.json({ error: 'no such task' }, 404)
        return c.json({ cancelled: ctx.tasks.cancel(id) })
      })
      .post('/ask', async (c) => {
        const { question } = await json(c)
        if (typeof question !== 'string') return c.json({ error: 'question must be a string' }, 400)
        return c.json(await ctx.agent.run(question))
      })
    ctx.router.route('/', app)
  },
}
