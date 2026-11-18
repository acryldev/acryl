# acryl-loopback-http

Ported as source from ACRYL (`runtime/acryl-loopback-http`, 37f4dd9c) for the IDE port, slice 2
([plan](../../docs/plans/ide-port.md)); provenance in [`provenance.json`](provenance.json). The original suite
runs unchanged: `pnpm test` in this folder.

The single strict same-origin loopback check for ACRYL's private Host routes, with a bounded JSON body reader
and uniform JSON responses.

A private route must be reachable only from the app's own page: the socket must be on loopback, the `Host`
header must match, and a mutating request (or a WebSocket upgrade) must carry the exact `Origin`.

Two entries, one rule:

- `acryl-loopback-http`: the check and helpers on `node:http` (`IncomingMessage`, `ServerResponse`), for a route still
  registered directly on the DSH `webServer` (plugin administration, support, sign-in, and the WebSocket upgrades until the
  router carries them, spec 048).
- `acryl-loopback-http/router`: the same rules on the framework's router (`acrylblends`), for routes served through
  `ctx.routerHttp.mount(prefix)`: `ownPage`, `privateApi(prefixes, ...routes)` (private headers and 405 with `Allow`, scoped to the
  plugin's prefixes), `jsonContent` (415), `jsonBody(maxBytes)` (413) and `readJson`. Used by `acryl-workspace`,
  `acryl-agent-control`, `acryl-sign-in` and Desktop.
  `acrylblends` is a peer dependency: the router's classes must be the app's one copy.
