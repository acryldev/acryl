import type { Context } from '@deepseek-ai/cordis'
import type {} from '../plugins/acryl-db/src/cordis.ts'
import { createApp } from './notes-app.ts'

/** The app's own plugin: it builds the app on the `db` port and mounts it on the router. The mount is removed when the plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router', 'db'],
  apply(ctx: Context) {
    ctx.router.route('/', createApp(ctx.db))
  },
}
