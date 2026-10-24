# Node server

`acryl-node-server` serves the whole router over HTTP from a standalone Node.js process. Use it for an app that runs without the ACRYL
Host. Inside the Host (Web and Desktop), the Host owns the web server and a plugin asks `acryl-router-http` to serve its prefix instead.

## Serve the router

The server is a Cordis plugin that provides the `nodeServer` service:

```ts
import { Context } from '@deepseek-ai/cordis'
import * as router from 'acryl-router'
import * as nodeServer from 'acrylblends/node-server'
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

## Not yet supported

WebSocket upgrades under the router are a later task. The adapter's own WebSocket support exists in `src/adapter/` with its tests but is
not wired to the router yet.
