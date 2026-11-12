# Node server

`acryl-node-server` serves the whole router over HTTP from a standalone Node.js process. Use it for an app that runs without the ACRYL
Host. Inside the Host (Web and Desktop), the Host owns the web server and a plugin asks `acryl-router-http` to serve its prefix instead.

## Serve the router

The server is a Cordis plugin that provides the `nodeServer` service:

```ts
import { Context } from '@deepseek-ai/cordis'
import * as router from 'acrylblends/cordis/router'
import * as nodeServer from 'acrylblends/cordis/node-server'
import * as todo from './todo.ts'

const root = new Context()
root.plugin(router)
root.plugin(nodeServer, { port: 3000 })
root.plugin(todo)

root.inject(['nodeServer'], ctx => {
  console.log(`listening on ${ctx.nodeServer.url}`)
})
```

| Option | Default | Meaning |
| --- | --- | --- |
| `hostname` | `127.0.0.1` | address to bind; binding elsewhere exposes the app to the network |
| `port` | `0` | port to listen on; 0 lets the system choose |
| `scan` | `20` | how many further ports to try when the configured one is taken |

Without Cordis, `serve()` from `acrylblends/node-server` binds the same default, `127.0.0.1`; pass `hostname: '0.0.0.0'` to accept other
machines (see [Node.js](../getting-started/nodejs.md#listen-on-another-interface)).

The plugin becomes active once the server listens, so a plugin that injects `nodeServer` can rely on `ctx.nodeServer.url` and
`ctx.nodeServer.port`. A failure to bind fails the plugin.

Every request goes to `ctx.router.fetch`, so routes appear and disappear as plugins mount and unload, with no restart. A plugin's
`ctx.inject(['routerHttp'], ...)` call never fires here: this adapter serves every prefix already.

## Connection information

The adapter passes the socket's peer address and local port to the router as connection facts. Handlers read them through
`connectionOf(c)` or `getConnInfo(c)` and never touch Node socket objects, so the same handler runs in process and through the Host. See
[Context](../api/context.md#transport-facts).

## Static files

The Node `serveStatic` reads files from disk:

```ts
import { serveStatic } from 'acrylblends/node-server'

const app = new Acryl()
  .use('/assets/*', serveStatic({ root: './public' }))
  .get('/', serveStatic({ path: './public/index.html' }))
```

`root` is joined with the request path, relative to the working directory unless absolute. A request path with a `.` or `..` segment, a
doubled slash, a backslash or (unless `allowPercentInPath`) an encoded `%` is treated as not found and passed on with `next()`. Only `GET`
and `HEAD` are served. Other options: `rewriteRequestPath`, `precompressed` (serve a `.br`, `.zst` or `.gz` sibling when the client
accepts it), `index` (default `index.html`), and `onFound` / `onNotFound` hooks. Serve build output, never source folders.

## Shutdown

Disposing the plugin (or the root context) ends open streams, closes every connection and returns once the port is free. Disposing a
plugin that only mounted routes is different: its mount and the requests it is serving end, and the server keeps serving the others (see
[Plugin lifecycle](./plugin-lifecycle.md#disposal-sequence)).

## Choosing a port

Let the process configuration choose the address. Do not hard-code a development port in a reusable plugin: a plugin mounts routes and
leaves the socket to whichever adapter the app runs with.

## WebSocket upgrades

A plugin takes WebSocket upgrades with `ctx.nodeServer.upgrades()` (or `ctx.routerHttp.upgrades()` on the Host's web server, with `ctx.routerHttp.mount(prefix, { upgrade: [paths] })` naming the exact paths). It returns the ported `upgradeWebSocket`; the route is an ordinary route with ordinary middleware in front of it:

```ts
export function apply(ctx: Context) {
  const upgrade = ctx.nodeServer.upgrades()
  ctx.router.route('/', new Acryl()
    // Checks run before the upgrade: own page, loopback peer, exact Origin and Host. A refusal is a plain HTTP status with Connection: close, sent before any handshake.
    .use('/terminal', ownPage)
    .get('/terminal', upgrade(() => ({
      onMessage(event, socket) {
        if (socket.bufferedAmount < 1_000_000) socket.send(`echo ${String(event.data)}`)
      },
      onClose(event) {
        // Called exactly once, whoever closed the socket.
      },
    }), { textOnly: true })))
}
```

- **Limits.** Text frames only with `{ textOnly: true }` (binary frames never reach `onMessage`); `websocket.maxPayload` (default 1 MiB, a bigger frame closes the socket with 1009); no per-message compression; `socket.bufferedAmount` for back-pressure; `socket.close(code, reason)` with application codes such as 1013 or 4404 (a code the protocol forbids on the wire becomes 1011). No raw socket is exposed.
- **Dead peers.** The server pings every `websocket.heartbeat` ms (default 30 000) and terminates a peer that did not answer the last ping. `websocket.grace` (default 2000) is how long a closing socket gets.
- **Ownership.** The sockets a plugin's routes accepted belong to that plugin. When it unloads they are closed with 1001 within the grace (what is left is terminated), its handler sees `close` once, other plugins' sockets are untouched, and `ctx.nodeServer.sockets` counts what is still open. Stopping the server closes every socket.
- **Needs `ws`.** `npm install ws`; an app that never upgrades does not need it.
- **Tests.** `testWebSocket((request, env) => app.fetch(request, env), '/terminal', { headers })` from `acrylblends/node-server` runs the route and its middleware in process: a refusal answers `{ status }`, an accepted connection gives a `socket` that sends text frames, collects what the handler sent (`received`) and closes.
