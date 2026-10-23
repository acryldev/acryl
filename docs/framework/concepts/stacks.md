# Stacks

| Surface | How a request reaches the handler |
| --- | --- |
| Web | HTTP to the DSH `webServer`; `acryl-router-http` converts it to a `Request` and calls `router.fetch` |
| Desktop | the Electron renderer talks to the app's own loopback `webServer`, so the same path as Web |
| Terminal UI | no server: code calls `ctx.router.fetch(request)` or `ctx.router.request(path)` in process |
| Tests | `ctx.router.request(path)` with no socket |

A plugin registers routes once in `apply` and asks for HTTP with an inner `ctx.inject(['routerHttp'], ...)`, so the same package runs on a surface with no HTTP.
React stays the UI library: `useCell(cell)` (from `acryl-state/react`) subscribes a component to a cell.

The DeepSeek Harness stays the optional agent engine; the framework packages never import it.
