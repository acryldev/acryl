/**
 * Every public subpath of the framework and the source module it is built from: the one table the build (`tsdown.config.ts`) and the
 * package's `exports` (`scripts/exports.mjs`) are made from. The keys are the upstream package's own subpaths, with the project renamed
 * where a key names it (`<upstream>-base` is `acryl-base`); the public package (`acrylblends`) ships them unchanged. The sources are the
 * ported modules in `acryl-router` and `acryl-node-server`, never their Cordis entries, so nothing here loads Cordis.
 */

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INTERNAL } from './api-surface.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROUTER = '../../plugins/acryl-router/src'
const CORE = `${ROUTER}/core`
const NODE = '../../plugins/acryl-node-server/src/adapter'
const DB = '../../plugins/acryl-db/src'
const DB_SQLITE = '../../plugins/acryl-db-sqlite/src'
const KV = '../../plugins/acryl-kv/src'
const KV_JSON = '../../plugins/acryl-kv-json/src'
const KV_DB = '../../plugins/acryl-kv-db/src'
const P = '../../plugins'

const MIDDLEWARE = [
  'basic-auth', 'bearer-auth', 'body-limit', 'cache', 'combine', 'compress', 'context-storage', 'cors', 'csrf', 'etag', 'ip-restriction',
  'jsx-renderer', 'jwk', 'jwt', 'language', 'logger', 'method-not-allowed', 'method-override', 'mount', 'powered-by', 'pretty-json',
  'request-id', 'secure-headers', 'serve-static', 'timeout', 'timing', 'trailing-slash',
]
const HELPERS = ['accepts', 'adapter', 'cookie', 'dev', 'factory', 'html', 'proxy', 'route', 'ssg', 'streaming', 'testing']
/**
 * The hosting adapters of the package: Node is the primary runtime (`node-server`), Bun is experimental and has one smoke gate. The upstream's other adapters (AWS Lambda, Lambda@Edge,
 * Cloudflare, Netlify, Vercel, service worker) are not built or exported: no gate of ours deploys to them. Their ported sources stay in `plugins/acryl-router/src/core/adapter/`,
 * where they may become separate plugins, each with its own gate.
 */
const ADAPTERS = ['bun']
const ROUTERS = ['reg-exp-router', 'smart-router', 'trie-router', 'pattern-router', 'linear-router']
/** `<upstream>/utils/*`: each utility module by its file name. */
const UTILS = readdirSync(join(here, CORE, 'utils')).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')).map(name => name.slice(0, -3)).sort()

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
  // For the browser: the events of a POST event stream read with fetch (`EventSource` reads GET streams only).
  'read-sse': `${ROUTER}/helpers/read-sse.ts`,
  // The Node adapter, ported from the upstream's separate Node package: its root, and its two subpaths.
  'node-server': 'src/node-server.ts',
  'node-server/serve-static': `${NODE}/serve-static.ts`,
  'node-server/conninfo': `${NODE}/conninfo.ts`,
  // ACRYL's addition: `node --import acrylblends/node-server/register app.tsx` compiles JSX files with the app's own typescript.
  'node-server/register': '../../plugins/acryl-node-server/src/register.ts',
  // Data (spec 049): the `db` port and its plain SQLite opener, without Cordis. `acrylblends/db/sqlite` is the opener, not the Cordis plugin.
  'db': `${DB}/index.ts`,
  'db/sqlite': `${DB_SQLITE}/open.ts`,
  // kv (spec 049 slice 3): the port, the JSON-file opener and kv over db, without Cordis. Documents for an app too small for SQL.
  'kv': `${KV}/index.ts`,
  'kv/json': `${KV_JSON}/open.ts`,
  'kv/db': `${KV_DB}/open.ts`,
  // The conformance suites a provider of a port passes (spec 049): they run on the vitest the provider's test hands them as the third argument (`describeKvConformance(name, open, vitest)`). vitest is NOT a peer dependency of the package: a peer would put vitest, vite and their native files into a production install of every app.
  'db/conformance': 'src/db-conformance.ts',
  'kv/conformance': 'src/kv-conformance.ts',
  // The driver contract (spec 046 T028/T029): `ChatDriver`, `ChatEvent`, `TerminalDriver`, `TerminalSession`, `Drivers` and `createDrivers`, with no Cordis in it. The agent panel and the driver plugins write against it.
  'drivers': `${P}/agent-panel/drivers.ts`,
  // The door's three parts that other packages build on: the host API, the page protocol and the page API (browser code).
  'door/host': `${P}/acryl-door/src/host/api.ts`,
  'door/protocol': `${P}/acryl-door/src/page/protocol.ts`,
  'door/page': `${P}/acryl-door/src/page/api.ts`,
  // The Cordis forms (spec 049 slice 17): each framework plugin as a module of the package. `@deepseek-ai/cordis` (and `@deepseek-ai/schemastery`) are optional peer dependencies:
  // an app that imports only the plain subpaths never loads them. They share their chunks with the plain subpaths, so `new Acryl()` from 'acrylblends' is the class `cordis/router` mounts.
  'cordis/router': `${ROUTER}/index.ts`,
  'cordis/router-http': `${P}/acryl-router-http/src/index.ts`,
  'cordis/state': `${P}/acryl-state/src/index.ts`,
  'cordis/state/react': `${P}/acryl-state/src/react.ts`,
  'cordis/inspect': `${P}/acryl-inspect/src/index.ts`,
  'cordis/node-server': `${P}/acryl-node-server/src/index.ts`,
  'cordis/db': `${DB}/cordis.ts`,
  'cordis/db-sqlite': `${DB_SQLITE}/index.ts`,
  'cordis/kv': `${KV}/cordis.ts`,
  'cordis/kv-json': `${KV_JSON}/index.ts`,
  'cordis/kv-db': `${KV_DB}/index.ts`,
  'cordis/door': `${P}/acryl-door/src/index.ts`,
}

/** The subpaths that are built (shared chunks keep their names) but are not part of the public API: see `api-surface.mjs`. */
export const isInternal = subpath => INTERNAL.includes(subpath)

/** The build entry name of a subpath: the file stem under `lib/`. */
export const entryName = subpath => (subpath === '.' ? 'index' : subpath)

/** The package's `exports`: {@link SUBPATHS} without the internal ones. */
export function exportsMap() {
  const map = {}
  for (const subpath of Object.keys(SUBPATHS)) {
    if (isInternal(subpath)) continue
    const name = entryName(subpath)
    map[subpath === '.' ? '.' : `./${subpath}`] = { types: `./lib/${name}.d.ts`, default: `./lib/${name}.js` }
  }
  map['./package.json'] = './package.json'
  return map
}
