import type { Context } from '@deepseek-ai/cordis'
import type {} from '../plugins/acryl-db/src/cordis.ts'
import { chatAccess } from './access.ts'
import { createApp } from './chat-app.ts'
import { openAiCompatible } from './llm.ts'
import { createClient } from './runtime.ts'

/** The app's own plugin: it builds the app on the `db` port and mounts it on the router. The mount is removed when the plugin is disposed. */
export const routes = {
  name: 'routes',
  inject: ['router', 'db'],
  apply(ctx: Context) {
    // In production the chat is closed unless it has a token or is made public on purpose: anyone who reaches it spends the model key.
    const { access, notices } = chatAccess(process.env)
    for (const line of notices) console.warn(line)
    ctx.router.route('/', createApp(ctx.db, openAiCompatible, access))
    ctx.router.route('/client', createClient())
  },
}
