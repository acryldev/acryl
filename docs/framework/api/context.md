# Context

`RouteContext` (`c`):

| Member | Meaning |
| --- | --- |
| `c.req`, `c.url` | the Web `Request` and its parsed URL |
| `c.param(name?)`, `c.params` | route parameters, URL-decoded; `*` for a wildcard remainder |
| `c.query(name?)` | one query parameter or all (first value wins) |
| `c.connection` | `{ remoteAddress?, localPort? }` from the socket; empty in process |
| `c.signal` | aborted when the caller goes away or the router is disposed |
| `c.get(key)`, `c.set(key, value)` | request-scoped values for middleware and handler |
| `c.header(name, value)`, `c.status(code)` | defaults carried by the response helpers |
| `c.json/text/html(data, status?)` | build a response |
| `c.body(data, status?, headers?)` | raw body: bytes, string, stream or nothing |
| `c.redirect(url, status?)` | 301, 302, 303, 307 or 308 |
| `c.notFound()` | the router's not-found response |
| `c.waitUntil(promise)` | keep the request in flight until the promise settles (streams) |
