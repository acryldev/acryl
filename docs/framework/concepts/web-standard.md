# Web standard

Handlers receive a `RouteContext` and return a Web `Response`. `c.req` is a Web `Request`, so `await c.req.json()`, `c.req.headers`, `URL` and streams work as in a
browser or Hono. There is no framework-specific request or response type to learn.

Deliberately not abstracted: cookies, body parsing beyond `readJson`/`readText`/`readBytes`, and templating. Use the platform.

Transport facts are not headers. The peer address and the real local port are `c.connection` (`remoteAddress`, `localPort`), filled from the socket by
the adapter. A call made in process has none, and guards such as `loopbackOnly` treat that as "not a socket peer" (`inProcess: 'deny' | 'allow'`).
