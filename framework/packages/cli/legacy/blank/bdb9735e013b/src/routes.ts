import type { Context } from '@deepseek-ai/cordis'
import type {} from './plugins/acryl-router/src/index.ts'

export const APP_NAME = '__APP_NAME__'

/** The app's own routes on the router. A route registered from this plugin's context is removed when the plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context) {
    ctx.router.get('/', (c) => c.json({ app: APP_NAME, ok: true }))
    ctx.router.get('/health', (c) => c.json({ ok: true }))
  },
}
