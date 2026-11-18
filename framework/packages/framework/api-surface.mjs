/**
 * The API surface of `acrylblends`, written out: every subpath the package builds is either PUBLIC (in `exports`, covered by semver from 1.0) or INTERNAL (built so shared chunks keep
 * their names, but not exported and not promised). `tests/package.test.mjs` fails when a built subpath is in neither list, in both, or when `exports` differs from PUBLIC, so a change to
 * the surface is a visible edit here.
 *
 * Node is the primary runtime (`node-server`); `bun` is EXPERIMENTAL with one smoke gate; the upstream's other hosting adapters (AWS Lambda, Lambda@Edge, Cloudflare, Netlify, Vercel,
 * service worker) are not built at all (see `subpaths.mjs`).
 */

/** In `exports`. */
export const PUBLIC = [
  // The package root, the request and types entries, the presets, and the exception class.
  ...[
  '.',
  'request',
  'types',
  'http-exception',
  'tiny',
  'quick',
],
  // Middleware.
  ...[
  'basic-auth',
  'bearer-auth',
  'body-limit',
  'cache',
  'combine',
  'compress',
  'context-storage',
  'cors',
  'csrf',
  'etag',
  'ip-restriction',
  'jsx-renderer',
  'jwk',
  'jwt',
  'language',
  'logger',
  'method-not-allowed',
  'method-override',
  'mount',
  'powered-by',
  'pretty-json',
  'request-id',
  'secure-headers',
  'serve-static',
  'timeout',
  'timing',
  'trailing-slash',
  'loopback-only',
],
  // Helpers and validators.
  ...[
  'accepts',
  'adapter',
  'cookie',
  'dev',
  'factory',
  'html',
  'proxy',
  'route',
  'ssg',
  'streaming',
  'testing',
  'ws',
  'css',
  'conninfo',
  'validator',
  'client',
  'schema-validator',
  'read-sse',
],
  // JSX: the string renderer and the DOM renderer; the `*-runtime` entries are the compiler targets named in tsconfig.
  ...[
  'jsx',
  'jsx/jsx-runtime',
  'jsx/jsx-dev-runtime',
  'jsx/streaming',
  'jsx/dom',
  'jsx/dom/jsx-runtime',
  'jsx/dom/jsx-dev-runtime',
  'jsx/dom/client',
  'jsx/dom/css',
  'jsx/dom/server',
],
  // Routers.
  ...[
  'router',
  'router/reg-exp-router',
  'router/smart-router',
  'router/trie-router',
  'router/pattern-router',
  'router/linear-router',
],
  // The Node adapter, and Bun (experimental).
  ...[
  'bun',
  'node-server',
  'node-server/serve-static',
  'node-server/conninfo',
  'node-server/register',
],
  // The `db` and `kv` ports, their openers and conformance suites.
  ...[
  'db',
  'db/sqlite',
  'kv',
  'kv/json',
  'kv/db',
  'db/conformance',
  'kv/conformance',
],
  // The driver contract the agent panel and the driver plugins (`driver-pty`, `driver-acp`) are written against.
  'drivers',
  // The door (experimental, development only).
  ...[
  'door/host',
  'door/protocol',
  'door/page',
],
  // The Cordis forms of the framework plugins.
  ...[
  'cordis/router',
  'cordis/router-http',
  'cordis/state',
  'cordis/state/react',
  'cordis/inspect',
  'cordis/node-server',
  'cordis/db',
  'cordis/db-sqlite',
  'cordis/kv',
  'cordis/kv-json',
  'cordis/kv-db',
  'cordis/door',
],
]

/** Public but not yet promised: development tools and one runtime without a deployment gate. Each carries the label in its page. */
export const EXPERIMENTAL = ['bun', 'door/host', 'door/protocol', 'door/page', 'cordis/door']

/** Built, not exported: the shared base class chunk and the ported core's utility modules. */
export const INTERNAL = [
  'acryl-base',
  'utils/accept',
  'utils/basic-auth',
  'utils/body',
  'utils/buffer',
  'utils/color',
  'utils/compress',
  'utils/concurrent',
  'utils/constants',
  'utils/cookie',
  'utils/crypto',
  'utils/encode',
  'utils/filepath',
  'utils/handler',
  'utils/headers',
  'utils/html',
  'utils/http-status',
  'utils/ipaddr',
  'utils/jwt',
  'utils/mime',
  'utils/stream',
  'utils/types',
  'utils/url',
]
