# acryl-node-server

The framework's standalone HTTP adapter (spec 046), the standalone counterpart of the Host adapter. One `node:http` listener
that hands every request to `ctx.router.fetch`, with the socket's peer address and local port as connection facts. Use it in an app that runs
without the ACRYL Host. Inside the Host, `acryl-router-http` mounts prefixes on the Host's own web server instead: one adapter per runtime.

```ts
import * as router from 'acryl-router'
import * as nodeServer from 'acryl-node-server'

const root = new Context()
root.plugin(router)
root.plugin(nodeServer, { port: 3000, hostname: '127.0.0.1', scan: 20 })
// your plugins call ctx.router.get(...); then root.nodeServer.url is where they are served
```

- Config: `hostname` (default `127.0.0.1`, loopback), `port` (default 0, the system chooses), `scan` (default 20: when `port` is taken the next free port is tried, up to `scan` times).
- Service `ctx.nodeServer`: `url`, `port`, `hostname`. The plugin finishes loading once it listens, so dependents can rely on `url`; a bind failure fails the plugin.
- A plugin that asks `ctx.inject(['routerHttp'], ...)` for a mount simply never gets that callback here, because this adapter serves the whole router.
- Disposal ends open streams, closes every connection and returns once the port is free.

Row id and package name: `acryl-node-server`.
