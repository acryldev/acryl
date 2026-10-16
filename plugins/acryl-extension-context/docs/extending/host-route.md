# Host routes: an HTTP API for a web/desktop plugin

Example: `../example-plugins/packages/host-route-basic/`. Inject `webServer` and register a route inside
`ctx.effect`: `ctx.webServer.register({ kind: 'exact', path, handler: (req, res) => ... })`. Web and
desktop only (tui has no web server). A client bundle can `fetch` the route to share state with the
host and with other devices. Validate every input; the route is reachable by the page.

To persist data behind a route, prefer exact RPC routes under `/api` (`connection.fetch.register`, answered in the RPC envelope) over a bare route, and read
`state-and-persistence.md` first: it lists every place a plugin can keep state and the mistakes that break an RPC route (result envelope, rpcId, payload).
`connection.rpc.handle` works in ACRYL only (stock DSH's connection row lacks `webServer`). Example: `../example-plugins/packages/state-host-store/`.
