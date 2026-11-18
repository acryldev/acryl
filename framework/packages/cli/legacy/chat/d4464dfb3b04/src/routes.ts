import type { Context } from '@deepseek-ai/cordis'
import type {} from '../plugins/acryl-db/src/cordis.ts'
import { chatAccess } from './access.ts'
import { createApp } from './chat-app.ts'
import { openAiCompatible } from './llm.ts'
import { createClient } from './runtime.ts'

/**
 * The only place the app's mount prefix is named: the root on its own server (`npm start`), `/app` when the ACRYL frame hosts it (`npm run dev`). Every
 * URL the page writes is derived from the prefix the app is mounted at, so the standalone URLs do not move.
 */
export const FRAME_MOUNT_PREFIX = '/app'

/** The app's own plugin: it builds the app on the `db` port and mounts it on the router at `options.prefix` (the root when absent). The mounts are removed when the plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router', 'db'],
  apply(ctx: Context, options: { prefix?: string } = {}) {
    const prefix = options.prefix ?? ''
    // In production the chat is closed unless it has a token or is made public on purpose: anyone who reaches it spends the model key.
    const { access, notices } = chatAccess(process.env)
    for (const line of notices) console.warn(line)
    ctx.router.route(
      prefix === '' ? '/' : prefix,
      createApp(ctx.db, openAiCompatible, access, { prefix }),
    )
    ctx.router.route(`${prefix}/client`, createClient(prefix))
  },
}
