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

/**
 * The only place the app's mount prefix is named: the root on its own server (`npm start`), `/app` when the ACRYL frame hosts it (`npm run dev`). Every
 * URL the pages write is derived from the prefix the app is mounted at, so the standalone URLs do not move.
 */
export const FRAME_MOUNT_PREFIX = '/app'

/**
 * The app's own pages, mountable at any prefix: the standalone server mounts it at the root, the frame row at {@link FRAME_MOUNT_PREFIX}.
 * A page that carries a client component writes its URL from the prefix it is mounted at.
 */
export function makeApp(prefix = ''): Acryl {
  return new Acryl()
    .get('/', (c) => c.json({ app: APP_NAME, ok: true }))
    .get('/health', (c) => c.json({ ok: true }))
    .get('/about', (c) => c.html(aboutPage()))
    .get('/counter', (c) => c.html(counterPage(prefix)))
}

/** The routes, in a file that does not import the Node adapter's server, so browser code can import the type: `import type { AppType } from '../routes.ts'`. */
export type AppType = ReturnType<typeof makeApp>

/**
 * The app's own plugin: the pages above at `options.prefix` (the root when absent), and the client components without a bundler (`src/client` is compiled
 * when the browser asks; `npm run build` compiles it once for production, and `NODE_ENV=production` then serves only `dist/client`). The mounts are
 * removed when the plugin is disposed.
 */
export const routes = {
  name: 'routes',
  inject: ['router'],
  apply(ctx: Context, options: { prefix?: string } = {}) {
    const prefix = options.prefix ?? ''
    ctx.router.route(prefix === '' ? '/' : prefix, makeApp(prefix))
    ctx.router.route(
      `${prefix}/client`,
      clientModules({
        root: 'src/client',
        compiled: 'dist/client',
        runtimeDir,
        mount: `${prefix}/client`,
      }),
    )
  },
}
