/**
 * Every public subpath of the framework and the source module it is built from: the one table the build (`tsdown.config.ts`) and the
 * package's `exports` (`scripts/exports.mjs`) are made from. The keys are the upstream package's own subpaths, with the project renamed
 * where a key names it (`<upstream>-base` is `acryl-base`); the public package (`acrylblends`) ships them unchanged. The sources are the
 * ported modules in `acryl-router` and `acryl-node-server`, never their Cordis entries, so nothing here loads Cordis.
 */

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROUTER = '../../plugins/acryl-router/src'
const CORE = `${ROUTER}/core`
const NODE = '../../plugins/acryl-node-server/src/adapter'

const MIDDLEWARE = [
  'basic-auth', 'bearer-auth', 'body-limit', 'cache', 'combine', 'compress', 'context-storage', 'cors', 'csrf', 'etag', 'ip-restriction',
  'jsx-renderer', 'jwk', 'jwt', 'language', 'logger', 'method-not-allowed', 'method-override', 'mount', 'powered-by', 'pretty-json',
  'request-id', 'secure-headers', 'serve-static', 'timeout', 'timing', 'trailing-slash',
]
const HELPERS = ['accepts', 'adapter', 'cookie', 'dev', 'factory', 'html', 'proxy', 'route', 'ssg', 'streaming', 'testing']
/** The hosting adapters (a handler for a platform that calls `fetch`): each is `<upstream>/<name>`. */
const ADAPTERS = ['aws-lambda', 'bun', 'cloudflare-pages', 'cloudflare-workers', 'lambda-edge', 'netlify', 'service-worker', 'vercel']
const ROUTERS = ['reg-exp-router', 'smart-router', 'trie-router', 'pattern-router', 'linear-router']
/** `<upstream>/utils/*`: each utility module by its file name. */
const UTILS = readdirSync(join(here, CORE, 'utils')).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => name.slice(0, -3)).sort()

/** Subpath (without `./`; `.` is the root) to source, relative to this package. */
export const SUBPATHS = {
  '.': 'src/index.ts',
  'request': `${CORE}/request.ts`,
  'types': `${CORE}/types.ts`,
  'acryl-base': `${CORE}/app-base.ts`,
  'http-exception': `${CORE}/http-exception.ts`,
  // The presets: the same class on another router (`tiny`: PatternRouter, `quick`: LinearRouter then TrieRouter).
  'tiny': `${CORE}/preset/tiny.ts`,
  'quick': `${CORE}/preset/quick.ts`,
  ...Object.fromEntries(MIDDLEWARE.map(name => [name, `${CORE}/middleware/${name}/index.ts`])),
  ...Object.fromEntries(HELPERS.map(name => [name, `${CORE}/helper/${name}/index.ts`])),
  ...Object.fromEntries(ADAPTERS.map(name => [name, `${CORE}/adapter/${name}/index.ts`])),
  'ws': `${CORE}/helper/websocket/index.ts`,
  'css': `${CORE}/helper/css/index.ts`,
  // JSX: the string renderer and its runtimes, streaming, and the DOM renderer (with its own runtimes, client, CSS and server entries).
  'jsx': `${CORE}/jsx/index.ts`,
  'jsx/jsx-runtime': `${CORE}/jsx/jsx-runtime.ts`,
  'jsx/jsx-dev-runtime': `${CORE}/jsx/jsx-dev-runtime.ts`,
  'jsx/streaming': `${CORE}/jsx/streaming.ts`,
  'jsx/dom': `${CORE}/jsx/dom/index.ts`,
  'jsx/dom/jsx-runtime': `${CORE}/jsx/dom/jsx-runtime.ts`,
  'jsx/dom/jsx-dev-runtime': `${CORE}/jsx/dom/jsx-dev-runtime.ts`,
  'jsx/dom/client': `${CORE}/jsx/dom/client.ts`,
  'jsx/dom/css': `${CORE}/jsx/dom/css.ts`,
  'jsx/dom/server': `${CORE}/jsx/dom/server.ts`,
  'conninfo': 'src/conninfo.ts',
  'validator': `${CORE}/validator/index.ts`,
  'client': `${CORE}/client/index.ts`,
  'router': `${CORE}/router.ts`,
  ...Object.fromEntries(ROUTERS.map(name => [`router/${name}`, `${CORE}/router/${name}/index.ts`])),
  'utils/jwt': `${CORE}/utils/jwt/index.ts`,
  ...Object.fromEntries(UTILS.map(name => [`utils/${name}`, `${CORE}/utils/${name}.ts`])),
  // ACRYL's own additions, not in the upstream package.
  'loopback-only': `${ROUTER}/middleware/loopback-only.ts`,
  'schema-validator': `${ROUTER}/helpers/schema-validator.ts`,
  // The Node adapter, ported from the upstream's separate Node package: its root, and its two subpaths.
  'node-server': 'src/node-server.ts',
  'node-server/serve-static': `${NODE}/serve-static.ts`,
  'node-server/conninfo': `${NODE}/conninfo.ts`,
  // ACRYL's addition: `node --import acrylblends/node-server/register app.tsx` compiles JSX files with the app's own typescript.
  'node-server/register': '../../plugins/acryl-node-server/src/register.ts',
}

/** The build entry name of a subpath: the file stem under `lib/`. */
export const entryName = subpath => (subpath === '.' ? 'index' : subpath)

/** The package's `exports`, made from {@link SUBPATHS}. */
export function exportsMap() {
  const map = {}
  for (const subpath of Object.keys(SUBPATHS)) {
    const name = entryName(subpath)
    map[subpath === '.' ? '.' : `./${subpath}`] = { types: `./lib/${name}.d.ts`, default: `./lib/${name}.js` }
  }
  map['./package.json'] = './package.json'
  return map
}
