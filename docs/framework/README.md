# ACRYL Framework

Status: 0.4.0 (spec 047, `specs/047-framework-port/plan.md`). The application core in `acryl-router` and the Node adapter in
`acryl-node-server` are ported from a mature MIT web framework with their test suites; the Cordis plugins around them are ACRYL's own.

The ACRYL Framework is the small, readable layer on top of Cordis that turns "a bunch of DSH packages" into building an agentic app. You
write an ordinary `App` (routes, a `Context`, middleware with `next()`, validators and helpers on Web-standard `Request` and `Response`),
and a Cordis plugin mounts it with `ctx.router.route(path, app)`.

## The five rules

1. **Everything extensible is a Cordis plugin.**
2. **One application, several surfaces** - share capabilities and contracts, not necessarily the transport.
3. **One declared contract per plugin** - what it provides, needs, and registers (routes, commands, tools, slots).
4. **Every registration is reversible** - unloading a plugin removes what it owns.
5. **Conventions are explicit and small** - an ordinary feature needs no knowledge of runtime internals.

## What it gives you

One handler, every surface. A plugin writes a handler once; Web and Desktop reach it over HTTP (Desktop's window talks to the app's own
loopback server), the terminal UI and tests call it in process with `ctx.router.request(path)`, and a standalone process serves it with
`acryl-node-server`. The universal entry point is `ctx.router.fetch(request)`.

## Documentation map

| Topic | Page |
| --- | --- |
| First application | [Getting started](./getting-started.md) |
| Every everyday call on one page | [API summary](./api-summary.md) |
| Framework model | [Core concepts](./concepts.md) |
| Routes and mounting | [Routing and mounting](./routing.md) |
| Handler context | [Context](./context.md) |
| Reading requests | [Request](./request.md) |
| Cross-cutting behavior, and the built-in list | [Middleware](./middleware.md) |
| Input checking | [Validation](./validation.md) |
| Streaming, cookies, testing and the rest | [Helpers](./helpers.md) |
| Serving without the ACRYL Host | [Node server](./node-server.md) |
| Cordis ownership and service state | [Plugin lifecycle and disposal](./plugin-lifecycle.md) |
| The application surfaces | [Surfaces and adapters](./surfaces.md) |
| Leaving the DSH server | [Migration from the DSH webServer](./migration-from-dsh-webserver.md) |
| Moving from 0.3 | [Migration from 0.3](./migration-from-0-3.md) |

[ACRYL Blends](https://acrylblends.github.io/) is the product-facing guide for building and publishing complete applications. The
framework pages here are the API and integration reference behind those guides. The mirrored developer documentation is published at
[acryl.dev/docs](https://acryl.dev/docs).

## The packages

| Package | What it is |
| --- | --- |
| `acryl-router` | `App` and the whole application API; the Cordis `router` service that composes the mounted apps; `acryl-router/middleware`, `acryl-router/helpers`, `acryl-router/client` |
| `acryl-router-http` | inside the ACRYL Host: `ctx.routerHttp.mount(prefix)` serves a prefix of the router on the Host's web server |
| `acryl-node-server` | without the Host: one `node:http` server for the whole router, `ctx.nodeServer.url`, and `serveStatic` |
| `acryl-state` | observable cells shared by every surface, with read-only HTTP and SSE routes and `useCell` for React |
| `acryl-inspect` | what each plugin requires, provides and mounts, read from the running system |

An app's `tsconfig.json` can extend `acryl-router/tsconfig.app.json` (ES2024 with the DOM types, strict). The DOM types are optional: every
entry point's types also stand with only `"lib": ["ES2024"]` and `"types": ["node"]`, the setting a Host-only plugin uses so browser globals
do not typecheck in server code (the router's `tests/no-dom` fixture checks this on every typecheck).

## Why this exists

DSH changes fast and stays one optional agent inside ACRYL. Cordis is the lifecycle ACRYL keeps across Web (browser), Desktop (Electron)
and the terminal UI. HTTP used to go through DSH's `webServer` - a `node:http` route table with no middleware and no Web-standard
`Request`/`Response` - which the terminal UI cannot reuse. The framework removes that coupling.
