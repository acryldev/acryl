import type { Context } from '@deepseek-ai/cordis'
import { App } from './plugins/acryl-router/src/index.ts'

export const APP_NAME = '__APP_NAME__'

/** The app's own routes: an `App` mounted on the router. The mount is removed when this plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context) {
    const app = new App()
      .get('/', (c) => c.json({ app: APP_NAME, ok: true }))
      .get('/health', (c) => c.json({ ok: true }))
    ctx.router.route('/', app)
  },
}
