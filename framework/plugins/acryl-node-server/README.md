# acryl-node-server

The framework's standalone HTTP adapter (spec 046, ported in spec 047), the standalone counterpart of the Host adapter. One `node:http`
server, built by the adapter in `src/adapter/`, that hands every request to `ctx.router.fetch`, with the socket's peer address and local
port as connection facts. Use it in an app that runs
without the ACRYL Host. Inside the Host, `acryl-router-http` mounts prefixes on the Host's own web server instead: one adapter per runtime.

```ts
import * as router from 'acryl-router'
import { Acryl } from 'acryl-router'
import * as nodeServer from 'acryl-node-server'

const root = new Context()
root.plugin(router)
root.plugin(nodeServer, { port: 3000, hostname: '127.0.0.1', scan: 20 })
// a plugin mounts an Acryl: ctx.router.route('/', new Acryl().get('/hello', c => c.text('hello')))
// root.nodeServer.url is where it is served
```

- Config: `hostname` (default `127.0.0.1`, loopback), `port` (default 0, the system chooses), `scan` (default 20: when `port` is taken the next free port is tried, up to `scan` times).
- Service `ctx.nodeServer`: `url`, `port`, `hostname`. The plugin finishes loading once it listens, so dependents can rely on `url`; a bind failure fails the plugin.
- A plugin that asks `ctx.inject(['routerHttp'], ...)` for a mount simply never gets that callback here, because this adapter serves the whole router.
- Disposal ends open streams, closes every connection and returns once the port is free.
- `serveStatic({ root })` serves files from disk (ranges, precompressed `.br`/`.zst`/`.gz` variants, `onFound`/`onNotFound`); use it as
  middleware in a mounted `Acryl`. A client that goes away aborts `c.req.raw.signal`.
- The platform's global `Request` and `Response` are left alone.

Row id and package name: `acryl-node-server`.
