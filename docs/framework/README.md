# ACRYL Framework

A small framework where the building block is a Cordis plugin. The design follows [Hono](https://hono.dev): Web-standard
`Request` and `Response`, a context object, middleware with `next()`, routers, built-in middleware and helpers, and an in-process
`request()` for tests. The structure of these docs follows Hono's too, so a Hono reader knows where to look.

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
| Compare with Hono | [Hono parity](hono-parity.md) |

## The packages

| Package | Hono counterpart | What it is |
| --- | --- | --- |
| `acryl-router` | `Hono` app, `app.request`, `hono/*` middleware | `ctx.router`: routes, groups, middleware, `fetch`, `request`, errors |
| `acryl-router-http` | the adapter (`@hono/node-server`) | `ctx.routerHttp.mount(prefix)` serves the router on the Web `webServer` |
| `acryl-state` | none (Hono has no state layer) | observable cells, SSE routes, `useCell` for React |
| `acryl-inspect` | none | what each plugin requires, provides and registers, from the running system |

Cordis itself provides what Hono leaves to you: lifecycle, dependency injection (`inject`), and removal of everything a unit registered.

Layout rules for a framework package are enforced by `node scripts/verify-framework.mjs` (part of `pnpm run check:layout`).
