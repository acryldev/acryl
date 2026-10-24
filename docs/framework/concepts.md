# Core concepts

The framework's request-handling model is designed so every extension point belongs to a Cordis plugin. This page explains the pieces
before the API reference.

## App

An `App` is a self-contained ACRYL application. It owns:

- routes;
- middleware;
- an error handler (`app.onError`);
- a request entry point (`app.fetch`, and `app.request` for tests);
- sub-applications placed below a path with `app.route(path, sub)`.

An app can be tested without a server:

```ts
const response = await app.request('/todos/42')
```

An app is not itself a Cordis service. That separation lets the same app be mounted by different hosts, at different paths, or not
mounted at all.

## Router service

The Cordis `router` service (`ctx.router`, provided by `acryl-router`) composes the mounted apps into one route space. A plugin builds an
app and mounts it:

```ts
ctx.router.route('/todo', app)
```

The mount copies the app's routes at that call. When any mount is added or removed, the next request composes a fresh app from the mounts
that are live, in the order they were made; requests already running keep the app they started with. This matches Cordis: plugins can
load, unload, reload and be replaced while the host stays up. The core's route tables are add-only, so rebuilding is the only correct way
to remove a route; it costs about 1 ms per 1000 routes, once per change.

The router also takes one router-wide `onError` and one `notFound` (each owned by the plugin that set it), and runs requests in process:
`ctx.router.fetch(request, connection?)` and `ctx.router.request(path, init?, connection?)`.

## Handler

A handler receives one context object, conventionally named `c`:

```ts
app.get('/todos/:id', c => {
  return c.json({ id: c.req.param('id') })
})
```

Handlers return a Web `Response`, either directly or through context helpers such as `c.text`, `c.json` and `c.html`.

## Middleware

Middleware wraps handlers and other middleware:

```ts
app.use('/admin/*', async (c, next) => {
  if (!isAllowed(c)) return c.text('Forbidden', 403)
  await next()
})
```

Code before `await next()` runs on the way in. Code after it can inspect or change the response (`c.res`) on the way out.

## Surface

A surface is the place a person or another program uses the application:

| Surface | Transport |
| --- | --- |
| Web | the ACRYL Host's web server, through `acryl-router-http` |
| Desktop | the same: the Electron window talks to the app's own loopback web server |
| Terminal UI | in process: `ctx.router.request(...)`, no server |
| A standalone process | `acryl-node-server` serves the whole router |
| Tests | `ctx.router.request(...)` or `app.request(...)` |

Surfaces share capabilities and contracts. They do not need to share a transport or a user interface.

## Plugin contract

Following the ACRYL framework rules, a plugin declares what it:

- provides as services;
- requires through injection;
- registers as routes, commands, tools or interface slots;
- owns until disposal.

The declaration is what lets tooling answer two questions without reading all the code: what does this plugin do, and what disappears
when it unloads? `acryl-inspect` reads it from the running system: each mount's label lists the routes it serves.

## State

Request state belongs to the context. Application state shared between surfaces belongs in `acryl-state` or an application-owned Cordis
service. Do not hide shared mutable state in module globals: Cordis can reload plugins and run several surfaces from one host, and a
module global outlives the plugin that wrote it.

## Design rules

1. Everything extensible is a Cordis plugin.
2. One application can serve several surfaces.
3. Each plugin has one declared contract.
4. Every registration is reversible.
5. Normal application code should not need runtime internals.
