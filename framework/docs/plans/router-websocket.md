# WebSocket upgrades on the router (spec 047 T009)

Status: built, released in 0.11.0 (the design below was approved as written; the hub sits in `acryl-node-server/src/upgrade-hub.ts`, and `acryl-router-http` requires `acryl-node-server` for it). Requested by ACRYL's M7: its last `webServer` call sites are the workspace terminal's `registerUpgrade` and the engine-web delegate, and they cannot move until the router can take upgrades.

## What already exists (port, do not invent)

The node adapter ported from `@hono/node-server` already carries the whole upgrade machinery, with its tests and provenance:

- `plugins/acryl-node-server/src/adapter/websocket.ts`: `setupWebSocket({ server, fetchCallback, wss })` listens to the server's `upgrade` event, runs the request through the app's `fetch` (so ordinary middleware runs), and when the handler accepted calls `wss.handleUpgrade`; a refusal is written as a plain `HTTP/1.1 <status>` with `Connection: close` before any handshake (`rejectUpgradeRequest`). `upgradeWebSocket(...)` is the route helper (`defineWebSocketHelper`) that returns either a `Response` (a refusal) or accepts and gets `onOpen/onMessage/onClose/onError` with a `WSContext`.
- `plugins/acryl-node-server/src/adapter/websocket-types.ts`, `tests/adapter/websocket.test.ts` (ported with the rest), `createAdaptorServer({ websocket: { server: wss } })`.
- The router's `ws` helper entry (`acrylblends/ws`: `WSContext`, `defineWebSocketHelper`).

What is missing is the Cordis side: `NodeServer` (`acrylblends/cordis/node-server`) never passes `websocket`, so nothing accepts an upgrade; `RouterHttp` (`acrylblends/cordis/router-http`, the adapter that mounts prefixes on the Host's `webServer`) has `mount(prefix)` for HTTP only; the sockets belong to nobody; the handler cannot see `bufferedAmount`; there is no ping, no payload cap policy, and the router's connection facts are not given to an upgrade request.

## Mapping ACRYL's requirements

### 1. Checks before the upgrade

They are ordinary middleware on the route, run by the same `router.fetch` the upgrade request goes through (`setupWebSocket` already does this). `acryl-loopback-http/router`'s `ownPage` works unchanged **if the upgrade request carries the same connection facts as an HTTP one**: today `setupWebSocket`'s bindings are `{ incoming, outgoing, wss }`; the Cordis adapters will pass `{ remoteAddress, localPort }` as well (read from `incoming.socket`, exactly as `serve()` does for HTTP), so the loopback peer, the exact `Origin` and `Host` on the real local port can be checked. Query validation (`id` required, `since` digits, at most 15) is the handler's own code before it calls `upgradeWebSocket`. A refusal returns a `Response` and is written as a plain `403`/`400` with `Connection: close` before any handshake (existing `rejectUpgradeRequest`; its headers pass through except the hop-by-hop ones).

A request with an `Upgrade` header that is not `websocket`, or a path the plugin does not mount, is refused too (404 / 400 through the same path): nothing is left half open. (The ported code returns for a non-WebSocket upgrade so another listener may take the socket; the Host adapter has no other listener, so there it refuses.)

### 2. Shape

The ported `upgradeWebSocket` handler, as is. Additions, each recorded as a deviation in `provenance.json` with the reason:

- `WSContext.bufferedAmount` (read from `ws.bufferedAmount`), so the terminal can back-pressure on it.
- `close(code, reason)` passes application codes (1013, 4404, 1008, 1001) through; the hub validates the code range (1000-1015 and 3000-4999 are legal to send) and falls back to 1011.
- Text only: the hub's `WebSocketServer` is created with `maxPayload` (default 1 MiB, configurable per hub), `perMessageDeflate: false`; binary frames are dropped before they reach `onMessage` (the handler sees text). A frame over `maxPayload` closes the socket with 1009 (what `ws` does).
- Ping/pong: the hub pings every `heartbeat` ms (default 30 s); a peer that did not answer the previous ping is `terminate()`d, and its `onClose` fires once. The timer is cleared on dispose.
- No raw socket is exposed.

### 3. Lifecycle

- **Ownership.** An upgrade handler belongs to the plugin whose context mounted the route (as `route()` and `mount()` do). The hub is a service with `hub.own(ctx)` returning a scope: every socket accepted for a route mounted through that scope is registered in it. Disposing the plugin disposes the scope.
- **Unload.** The scope's disposer (one `ctx.effect`) closes every socket it accepted with 1001 ("going away"), waits for the `close` events up to the grace (default 2000 ms), then `terminate()`s what is left. The handler's `onClose` runs **exactly once** per socket (guarded), whether the peer, the server, the heartbeat or the unload closed it.
- **Per prefix.** Registration is on the plugin's existing mount: `ctx.routerHttp.mount('/api/acryl-workspace', { upgrade: ['/api/acryl-workspace/terminal'] })`. The listed paths must be inside the prefix (checked, else `TypeError`); there is no second prefix and no upgrade on a path the plugin did not mount. On the Host's `webServer` each listed path is one exact-path `registerUpgrade` (that API is exact-path only), removed with the mount; in the standalone `NodeServer` the router decides (the route either answers an upgrade or the request is refused).
- **Zero sockets.** After dispose the hub's `wss.clients` is empty and the HTTP server has no upgraded socket; the test asserts both.

### 4. Where it lives

- `acryl-node-server`: `NodeServer` creates the hub (its `ws` server with the options above) and passes `websocket: { server }` to `createAdaptorServer`; `server.close` closes the hub. `upgradeWebSocket` becomes usable with `app.get('/ws', upgradeWebSocket(...))` in any Cordis app on the standalone server. `acrylblends/cordis/node-server` and `acrylblends/node-server` already export the adapter pieces; `ws` becomes an optional peer (an app that never upgrades does not need it).
- `acryl-router-http`: `mount(prefix, { upgrade })` and the hub on the Host path. The Host's `webServer.registerUpgrade` hands `(req, socket, head)`; the hub's `setupWebSocket` is given a tiny event source in place of the `Server` (it only needs `on('upgrade')` and `listenerCount`), so the same ported code serves both transports and is not copied.
- Subpath: `acrylblends/cordis/router-http` gets `mount`'s new option and the hub types; the hub implementation is shared from the node adapter (`acrylblends/node-server`).

## Tests

1. The ported `websocket.test.ts` stays as is.
2. Refusals: a real `ws` client sees `unexpected-response` with 403 and 400 and `Connection: close` for an origin/peer/host/query failure; no handshake happened; the middleware chain order is observed.
3. Text only and `maxPayload`: a binary frame is not seen by `onMessage`; an oversized frame closes 1009; `bufferedAmount` is a number that grows with an unread peer.
4. Heartbeat: a peer that stops answering pings is terminated and `onClose` fires once (fake timers).
5. Unload: two plugins each mount an upgrade route; three sockets open on the first, one on the second; dispose the first: its sockets close with 1001 within the grace, `onClose` ran once each, the second plugin's socket is untouched; dispose it too: `wss.clients.size === 0` and no upgraded socket remains.
6. Paths: an upgrade on an unmounted path and an upgrade with a non-`websocket` header are refused.
7. Both transports run the same suite: the standalone `NodeServer` and `RouterHttp` on a fake `webServer` with `registerUpgrade`.
8. In-process pair for tests, no network: `testWebSocket(app, '/path', { headers })` runs the route's handler with a paired fake `WSContext` and returns the client side (`send`, `close`, `messages`), so an app tests its handler through `app.request`-style code.
9. `verify:packed` adds an app that mounts an upgrade route and talks to it with a real client from the installed package.

## Release

A minor version (a new, additive capability), `acrylblends` 0.11.0 with `verify:packed`. `ws` as an optional peer of `acrylblends` (already used by the adapter's tests).

## Open points for ACRYL

- Exact-path list on `mount` (as above) versus prefix-wide upgrades: the Host's `registerUpgrade` is exact-path, so the plugin names its upgrade paths. Is one terminal path enough for the workspace, or does it need several?
- The default grace (2 s) and heartbeat (30 s): the terminal's own values, if different, go in the mount options.
