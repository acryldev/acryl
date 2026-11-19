# acryl-web-server

The `webServer` port of a framework-hosted app (slice 107, `docs/plans/ide-host-inversion.md`). DSH's driver rows - the chat's
connection and its remote gateway - register node handlers with `webServer.register` and `webServer.registerUpgrade`. This plugin
serves them on `acryl-node-server`'s raw routes, so those rows run unchanged while the HTTP host, the page and the client-module
serving stay the framework's.

It is the inverse of [`acryl-router-http`](../acryl-router-http/README.md): there the Host's web server serves a router prefix; here
our node server presents the web-server interface a DSH row expects.

- `register({ kind: 'exact' | 'prefix', path, handler })`: the handler receives the platform's `IncomingMessage`/`ServerResponse`
  and owns the response; the router is not run for it. A path already served throws; the returned remover restores it.
- `registerUpgrade({ path, handler })`: one exact path; the handler receives `(req, socket, head)` and owns the socket. The router's
  WebSocket handling never sees a claimed upgrade.
- `tapIndex(transform)`: transforms the served index document while the caller lives (the door's page script uses this shape).
- `host` and `port`: the address the node server bound (`acryl-web` reads these).

Every registration belongs to the plugin that made it: it leaves when that plugin unloads, and a repeated mount adds one route, not
two.
