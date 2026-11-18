# Feature Specification: Neutral HTTP contract, Hono host, Fastify host

**Milestone**: M5 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

The Unplugin lesson applied to servers: plugins contribute routes and middleware to neutral
registries using Web-standard `Request` and `Response`; host adapters (Hono, Fastify) turn a
network into `dispatcher.dispatch(request)`. The same plugin set behaves identically under both,
proved by one shared contract suite.

Every request runs in its own **Scope** (temporal composition): it has an abort signal, can hold
request-local services and resources, and is disposed when the response body is finished or
cancelled.

## User Scenarios & Testing

### User Story 1 - Contribute routes without knowing the host (P1)

A plugin adds `route('GET', '/hello/:name', ctx => text(...))` to the `Routes` registry. It does not
import Hono or Fastify. Adding or disposing the plugin adds or removes the route live.

### User Story 2 - Same behaviour under Hono and Fastify (P1)

The contract suite (`runHttpContract`) passes unchanged under `@aimbrace/hono` and `@aimbrace/fastify`:
static and parameterised routes, query, JSON body echo, 404, 405 with `Allow`, `HttpError` mapping,
500 without leaking messages, middleware order and short-circuit, per-request scope lifecycle, live
route add/remove, HEAD, multiple `Set-Cookie`, streaming bodies, clean shutdown.

### User Story 3 - A scope per request (P2)

Handlers receive `ctx.scope`. It is disposed after the response completes (also on cancel) and `app.probe().scopes` returns to zero. Concurrent requests get distinct scopes.

### User Story 4 - Typed HTTP hooks (P2)

`http:request`, `http:response`, `http:error` are declared by merging into `HookExtensions`.

### User Story 5 - Escape hatch (P3)

`HonoApp` and `FastifyApp` services expose the native instance for host-specific plugins (explicitly not portable).

## Requirements

- **FR-501**: `@aimbrace/http` MUST depend on `@aimbrace/core` only and use no Node-only API in routing and dispatch.
- **FR-502**: Matching MUST prefer static over param over wildcard segments, then registration order; a path match with the wrong method MUST be 405 with `Allow`.
- **FR-503**: Hosts MUST NOT own routing; they MUST call `HttpDispatcher.dispatch` from a single catch-all.
- **FR-504**: The request scope MUST be disposed exactly once, after the body stream ends or is cancelled.
- **FR-505**: Unhandled handler errors MUST yield a 500 JSON body without the error message and MUST fire `http:error`.
- **FR-506**: Hosts MUST stop listening and release the port on `stop`, and `probe()` MUST be clean afterwards.
- **FR-507**: `hono` and `fastify` are peer dependencies of their adapters; `@hono/node-server` is a dependency of the Hono adapter.
- **FR-508**: Plugin config for hosts uses Standard Schema (valibot) with defaults: `port` 3000, `hostname` `127.0.0.1`, `listen` true.
