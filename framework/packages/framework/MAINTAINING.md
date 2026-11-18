# Maintaining acrylblends-framework

The ACRYL Framework as a plain package: the web framework ported into `acryl-router` and `acryl-node-server`, built without Cordis into
one dependency-free `lib/` that the public `acrylblends` package ships as its root. This package is private; ACRYLBLENDS vendors its packed
tarball and publishes it under the name `acrylblends`.

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Acryl!'))

export default app
```

Node is the runtime the framework targets; serve the app with the adapter:

```ts
import { serve } from 'acrylblends/node-server'
import app from './index.ts'

serve({ fetch: app.fetch, port: 3000 })
```

## Subpaths

[`subpaths.mjs`](subpaths.mjs) is the one table of every public subpath and the ported module it is built from; the build entries and the
`exports` of `package.json` are both made from it (`node scripts/exports.mjs --write` regenerates `exports`, the build checks it). The keys
are the upstream package's own subpaths, plus ACRYL's additions (`loopback-only`, `schema-validator`, `connectionOf` and `RouterEnv` in
`conninfo`) and the Node adapter (`node-server`, `node-server/serve-static`, `node-server/conninfo`).

`App` and `AppRequest` are the 0.4 names of `Acryl` and `AcrylRequest`, kept as deprecated aliases for one release; see
[migration from 0.4](../../docs/framework/cordis/migration-from-0-4.md).

## Gates

- `corepack pnpm run check`: build, typecheck, and the package tests (every entry loads without Cordis, the built files import only their
  own chunks and `node:` built-ins, the root and the routers import no Node built-in at all).
- `corepack pnpm run verify:standalone`: packs the tarball, installs it as `acrylblends` in an empty folder, and serves the app above on
  Node; then typechecks every subpath with Node's types and no DOM library, including a `declare module 'acrylblends'` augmentation. Bun
  (`bun run`, `export default app`) runs too when it is installed, as information only. `check` runs it last.

The framework documentation is [`docs/framework`](../../docs/framework/README.md). Licenses: [LICENSE](LICENSE). [README.md](README.md) is the npm page of `acrylblends`; its TypeScript examples are typechecked by
`verify:standalone`, and it must not name the upstream project.
