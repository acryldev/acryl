import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { clientModules } from '../plugins/acryl-node-server/src/client-modules.ts'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { aboutPage, counterPage } from './page.tsx'

/** The browser builds of the DOM renderer and the typed client, shipped by the `acrylblends` package this app depends on. */
const runtimeDir = join(
  dirname(createRequire(import.meta.url).resolve('acrylblends/package.json')),
  'lib',
  'browser',
)

export const APP_NAME = '__APP_NAME__'

/** The routes, in a file that does not import the Node adapter's server, so browser code can import the type: `import type { AppType } from '../routes.ts'`. */
export const pages = new Acryl()
  .get('/', (c) => c.json({ app: APP_NAME, ok: true }))
  .get('/health', (c) => c.json({ ok: true }))
  .get('/about', (c) => c.html(aboutPage()))
  .get('/counter', (c) => c.html(counterPage()))

export type AppType = typeof pages

/**
 * The app's own plugin: the routes above, and the client components without a bundler (`src/client` is compiled when the browser asks; `npm run build`
 * compiles it once for production, and `NODE_ENV=production` then serves only `dist/client`). The mounts are removed when the plugin is disposed.
 */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context) {
    ctx.router.route('/', pages)
    ctx.router.route(
      '/client',
      clientModules({ root: 'src/client', compiled: 'dist/client', runtimeDir }),
    )
  },
}
