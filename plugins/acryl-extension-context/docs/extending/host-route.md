# Host routes: an HTTP API for a web/desktop plugin

Example: `../example-plugins/packages/host-route-basic/`. Inject `webServer` and register a route inside
`ctx.effect`: `ctx.webServer.register({ kind: 'exact', path, handler: (req, res) => ... })`. Web and
desktop only (tui has no web server). A client bundle can `fetch` the route to share state with the
host and with other devices. Validate every input; the route is reachable by the page.
