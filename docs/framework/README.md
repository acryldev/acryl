# ACRYL Framework

A small framework where the building block is a Cordis plugin: Web-standard `Request` and `Response`, a context object, middleware with
`next()`, routers, built-in middleware and helpers, and an in-process `request()` for tests. It is ACRYL's own; nothing here depends on another web framework.

Status: working, spec 046 (`specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/`). Every Blend (a Blank app and
everything grown from it) starts with the framework kit on its Web surface.

## Start here

| I want to | Read |
| --- | --- |
| Run something in five minutes | [Getting started](getting-started.md) |
| Understand why it is built this way | [Motivation](concepts/motivation.md), [Plugins are the unit](concepts/plugins-as-units.md) |
| Look up a call | [API](api/README.md) |
| Copy a pattern | [Guides](guides/README.md) |
| See what ships in the box | [Middleware and helpers](middleware/README.md) |

## The packages

| Package | What it is |
| --- | --- |
| `acryl-router` | `ctx.router`: routes, groups, middleware, `fetch`, `request`, errors |
| `acryl-router-http` | `ctx.routerHttp.mount(prefix)` serves the router on the Web `webServer` |
| `acryl-node-server` | standalone adapter: one `node:http` listener serving the whole router, `ctx.nodeServer.url`; use where the ACRYL Host is not running |
| `acryl-state` | observable cells, SSE routes, `useCell` for React |
| `acryl-inspect` | what each plugin requires, provides and registers, from the running system |

Cordis itself provides the lifecycle, dependency injection (`inject`) and removal of everything a unit registered.

Layout rules for a framework package are enforced by `node scripts/verify-framework.mjs` (part of `pnpm run check:layout`).
