# Surfaces and adapters

An ACRYL application is written once and reached through the surface that fits the user. Surfaces provide transport and presentation;
plugins provide capabilities.

## Surface model

| Surface | How requests arrive | Typical use |
| --- | --- | --- |
| Web | HTTP to the ACRYL Host's web server, through `acryl-router-http` | browser applications and APIs |
| Desktop | the same Host web server on a loopback port, opened in the Electron window | local-first applications |
| Terminal UI | in process: `ctx.router.request(...)` or `ctx.router.fetch(...)` | operator tools, agents, terminal workflows |
| Standalone process | HTTP through `acryl-node-server` | an app that runs without the Host |
| Tests | `ctx.router.request(...)` or `app.request(...)` | handler and contract tests |

The handler does not know which row supplied the request. When it needs a transport fact it reads the connection from the context
(`connectionOf(c)`), which is empty for an in-process call.

## Web

The Host owns the listening socket, the address and process shutdown. A plugin mounts its app on the router, then asks the adapter to
serve the prefix over HTTP:

```ts
ctx.router.route('/todo', app)
ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
```

Only prefixes asked for this way are served over HTTP. A prefix the Host's web server already serves cannot be claimed: `mount` throws,
so a plugin cannot take over a Host route by mounting on it.

## Desktop

Desktop runs the same Host inside Electron, and its window talks to the Host's web server on a loopback port. A plugin's routes therefore
serve Desktop exactly as they serve Web, with no Desktop-specific code. Guard local control routes with `loopbackOnly` (see
[Middleware](../concepts/middleware.md#loopbackonly)).

A transport without a port, handing `ctx.router.fetch` to Electron's `protocol.handle`, needs no change to plugins and is a later task
(`specs/047-framework-port/plan.md` T014).

Desktop capabilities such as windows, files and native dialogs belong in declared Cordis services. A handler calls the service; it does not
import Electron.

## Terminal UI

A terminal surface needs no server. It calls the composed router in process:

```ts
const response = await ctx.router.request('/todo/todos')
const todos = await response.json()
```

The `routerHttp` service does not exist there, so the plugin's `ctx.inject(['routerHttp'], ...)` simply never runs. Check the services a
host declares instead of assuming a network route exists.

## What belongs where

| Concern | Owner |
| --- | --- |
| Route handlers and middleware | the feature plugin's `Acryl` |
| Mount path and lifetime | the feature plugin, through `ctx.router.route` |
| Socket and port | the Host (`acryl-router-http`) or `acryl-node-server` |
| Terminal rendering and input | the terminal surface |
| Shared domain behavior | a domain service every surface uses |
| Shared reactive state | `acryl-state` or an application service |

## Loopback-only routes

Some routes exist only for the local host, such as callbacks and control endpoints. Guard them with `loopbackOnly` at the framework
boundary; do not rely on an obscure path or a missing link as access control. Loopback restriction is separate from authentication: a
local route that does privileged work still needs the host's authorization policy.
