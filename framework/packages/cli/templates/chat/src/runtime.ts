import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { clientModules } from '../plugins/acryl-node-server/src/client-modules.ts'

/** The browser builds of the DOM renderer and the typed client, shipped by the `acrylblends` package this app depends on (`clientModules` serves them). */
const runtimeDir = join(
  dirname(createRequire(import.meta.url).resolve('acrylblends/package.json')),
  'lib',
  'browser',
)

/**
 * Client components without a bundler: `src/client` is compiled when the browser asks; `npm run build` compiles it once for production
 * (`NODE_ENV=production` then serves only `dist/client`). `src/routes.ts` mounts it at `<prefix>/client` on the router, next to the app; the explicit
 * mount is the path below which its modules are found, so the same app works at the root and under the frame's prefix.
 */
export const createClient = (prefix = '') =>
  clientModules({
    root: 'src/client',
    compiled: 'dist/client',
    runtimeDir,
    mount: `${prefix}/client`,
  })
