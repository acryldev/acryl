import type { Context } from '@deepseek-ai/cordis'
import { readJson } from './plugins/acryl-router/src/helpers/index.ts'
import type {} from './plugins/acryl-router/src/index.ts'
import type {} from './plugins/agent/index.ts'
import type {} from './plugins/extensions/index.ts'
import type {} from './plugins/tasks/index.ts'

export const APP_NAME = '__APP_NAME__'

/**
 * The app's own routes on the router: `POST /ask` for the agent; `GET /extensions` and `GET /tasks` to observe what it did (every run is a
 * durable task owning one task per tool call); `POST /tasks/cancel`. What changes is also streamed: `GET /api/state/tasks/events` and
 * `GET /api/state/extensions/events`. A route registered from this plugin's context is removed when the plugin is disposed.
 */
export const routes = {
  name: 'routes',
  inject: ['router', 'agent', 'extensions', 'tasks'],
  apply(ctx: Context) {
    const { router } = ctx
    router.get('/', (c) => c.json({ app: APP_NAME, ok: true }))
    router.get('/health', (c) => c.json({ ok: true }))
    router.get('/extensions', (c) =>
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
      router.post(path, async (c) => {
        const name = ((await readJson(c)) as { name?: unknown } | undefined)?.name
        if (typeof name !== 'string') return c.json({ error: 'name must be a string' }, 400)
        return c.json(await decide(name))
      })
    }
    router.get('/tasks', (c) => c.json(ctx.tasks.list().slice(0, 100)))
    router.post('/tasks/cancel', async (c) => {
      const id = ((await readJson(c)) as { id?: unknown } | undefined)?.id
      if (typeof id !== 'string' || !ctx.tasks.get(id))
        return c.json({ error: 'no such task' }, 404)
      return c.json({ cancelled: ctx.tasks.cancel(id) })
    })
    router.post('/ask', async (c) => {
      const question = ((await readJson(c)) as { question?: unknown } | undefined)?.question
      if (typeof question !== 'string') return c.json({ error: 'question must be a string' }, 400)
      return c.json(await ctx.agent.run(question))
    })
  },
}
