# acryl-router

The ACRYL router: the application API (`App`, context, middleware, validation, helpers) and one Cordis service, `ctx.router`, that
mounts a plugin's app and lets every surface call it. Part of the ACRYL Framework (specs 046 and 047).

## What it gives you

```ts
import { App } from 'acryl-router'

export const name = 'notes'
export const inject = ['router']

export function apply(ctx: Context): void {
  const app = new App()
    .get('/:id', c => c.json({ id: c.req.param('id') }))
    .post('/', async c => c.json(await c.req.json(), 201))

  ctx.router.route('/api/notes', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/notes') })   // only where HTTP exists
}
```

- **Web-standard types.** Handlers take a context and return a `Response`. Nothing in a handler knows whether the caller is a browser,
  the Desktop window, the terminal UI or a test.
- **In-process `fetch`.** `ctx.router.fetch(request, connection?)` and `ctx.router.request(path, init?)` run the same handler with no
  socket. Web and Desktop reach it over HTTP through `acryl-router-http`; a standalone process uses `acryl-node-server`.
- **Owned mounts.** A mount belongs to the plugin that made it and goes away when that plugin unloads; `route` also returns a remover. A
  mount is a snapshot of the app's routes at the call.
- **Nothing outlives its owner.** Unloading a plugin ends the requests and streams its code is serving; disposing the router ends all of
  them and answers new requests with 503. Both wait for running work, bounded by `disposeGraceMs`.
- **Transport facts beside the request.** `connectionOf(c)` is the socket's peer address and local port, set by the adapter; an
  in-process call has none, and `loopbackOnly` refuses it unless told otherwise.

## Entry points

| Import | Contents |
| --- | --- |
| `acryl-router` | `App`, `HTTPException`, `connectionOf`, the router service and its types |
| `acryl-router/middleware` | the built-in middleware, including `loopbackOnly` |
| `acryl-router/helpers` | streaming, cookies, validation, factory, testing, connection info and more |
| `acryl-router/client` | the typed client for a running server, without Cordis |
| `acryl-router/tsconfig.app.json` | the TypeScript profile an app extends |

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `trailingSlash` | `strict` | `strict` keeps `/a` and `/a/` distinct; `ignore` treats them as one path |
| `disposeGraceMs` | `2000` | how long an unload or disposal waits for aborted requests, their bodies and their `waitUntil` work |

## Layout

- `src/core/`: the ported application core with its own suite beside it (`*.test.ts`); `scripts/verify-port.mjs` at the repo root keeps
  it identical to its recorded source except for the deviations listed in `provenance.json`.
- `src/service.ts`: the `Router` service: mounts, composition, the in-process fetch, ownership and disposal.
- `src/connection.ts`, `src/middleware/loopback-only.ts`, `src/helpers/schema-validator.ts`: the ACRYL additions.
- `tests/`: the service through Cordis (lifecycle, reload, replacement, disposal), the Loader, and the shadow-context proofs.
- `scripts/bench-remount.mjs`: the cost of composing after a mount change.

Documentation: `docs/framework/`. Row id and package name: `acryl-router`.
