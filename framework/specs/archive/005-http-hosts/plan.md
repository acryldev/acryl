# Plan: HTTP contract and hosts

## Packages

```text
packages/http/src
  types.ts       HttpMethod, Route, RouteContext, Handler, Middleware, HttpError
  router.ts      compilePath, matchRoute (static > param > wildcard)
  response.ts    json, text, html, redirect helpers
  tokens.ts      Routes, Middlewares registries; HttpDispatcher, HttpAddress services; hook extensions
  dispatch.ts    createDispatcher (scope per request, middleware chain, error mapping, body lifetime)
  plugin.ts      http plugin (provides HttpDispatcher), route() and routesPlugin()
packages/hono/src      honoHost plugin, HonoApp service
packages/fastify/src   fastifyHost plugin, FastifyApp service, Node <-> Web conversion
packages/http/test/contract.ts   shared suite imported by both host test files
```

## Design notes

- Both hosts register one catch-all (`hono.all('*')`, `fastify.all('/*')`). Hono cannot add routes after its first request; a catch-all over the live registry also gives hot add and remove.
- `HttpAddress` is provided during `setup` with getters filled in after listening, so dependents can read it from `start` onwards.
- Fastify gets a raw buffer content-type parser for every type so the neutral `Request` body is untouched.
- Contract tests listen on port 0 and use real `fetch`, so hosts are tested end to end.
