# Loopback Only Middleware

The guard for a local app's own routes, such as a control API a desktop window calls:

```ts
import { loopbackOnly } from 'acrylblends/loopback-only'

app.use('/control/*', loopbackOnly())
```

A request passes only when:

- the peer is a loopback address and arrived on the real local port, both read from the transport, never from a header;
- the `Host` header names a loopback hostname (`127.0.0.1`, `localhost`, `[::1]`, or `hostnames`) with that port, which stops DNS
  rebinding;
- for a request that changes things (not `GET`, `HEAD`, `OPTIONS`), any `Origin` is this same authority (`mutations: 'none'` turns this
  off).

An in-process call has no socket and is refused unless `inProcess: 'allow'` says the host's own code may call it. Everything refused gets a
403.

A private route that no other program on the machine may call either, such as a workspace's file and terminal routes, takes
`callers: 'own-page'`:

```ts
app.use('/api/workspace/*', loopbackOnly({ callers: 'own-page', hostnames: ['127.0.0.1'] }))
```

Then every request must come from a page this app served: an `Origin` that is exactly this authority (with `Sec-Fetch-Site` absent or
`same-origin`), or, for a read, which browsers often send without `Origin`, `Sec-Fetch-Site: same-origin` and a `Referer` from this
authority. A script with no `Origin` is refused even for a read. `fromOwnPage(c, authority)` is the same check for middleware of your own.
