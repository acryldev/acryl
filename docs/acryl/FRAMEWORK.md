# The ACRYL Framework: the building blocks and how they fit

Status: 0.4.0, the application core ported into Cordis plugins (spec 047), on the design of spec 046. This page is the map a person can
hold in their head. Rules and decisions: `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/` and
`specs/047-framework-port/`.

## The idea in one paragraph

ACRYL keeps Cordis as its only plugin system and lifecycle, keeps React for graphical UI, and adds a small set of services on
top that every surface (Web, Desktop, terminal) can use the same way. Each service is a Cordis plugin, small enough to read in
an evening, and every registration a plugin makes disappears when that plugin unloads.

## The blocks

| Block | Module | What it gives a plugin author | Size |
| --- | --- | --- | --- |
| Lifecycle | Cordis (`@deepseek-ai/cordis`) | plugins, `inject`, effects with disposers, PENDING until dependencies exist | the existing foundation |
| Routing | `acrylblends`, `acrylblends/cordis/router` | `Acryl` with routes, middleware, validation and helpers, mounted with `ctx.router.route('/x', app)`; in-process `ctx.router.fetch(request)` | the ported core (about 16,200 lines with its suite beside it) plus about 570 lines of Cordis service |
| Web adapter | `acrylblends/cordis/router-http` | `ctx.routerHttp.mount('/api/x')` serves those routes over the DSH `webServer` | about 140 lines |
| Standalone server | `acrylblends/node-server`, `acrylblends/cordis/node-server` | the whole router over `node:http` in a process without the Host | the ported Node adapter (about 2,900 lines) plus about 110 lines |
| Shared state | `acrylblends/cordis/state` | observable cells (`ctx.state.cell`), derived cells, JSON and server-sent-event routes, a React hook | about 200 lines |
| Introspection | `acrylblends/cordis/inspect` | what every plugin requires, provides and registers, and what unloads with it | about 170 lines |

React, Vite, Electron, `pi-tui` and typert are unchanged.

## One plugin, every surface

```ts
export const name = 'notes'
export const inject = ['router', 'state']

export function apply(ctx: Context): void {
  const count = ctx.state.cell('notes.count', 0)

  const app = new Acryl().post('/', async c => {                // Web-standard Request in, Response out
    count.update(n => n + 1)
    return c.json({ saved: (await c.req.text()).length }, 201)
  })
  ctx.router.route('/api/notes', app)

  ctx.inject(['routerHttp'], inner => {                      // HTTP only where an adapter exists
    inner.routerHttp.mount('/api/notes')
  })
}
```

- **Web and Desktop** reach `/api/notes` over HTTP (Desktop serves its renderer from its own loopback `webServer`, so it is the
  same path), and watch `notes.count` as a server-sent event stream or with `useCell(count)` in React.
- **The terminal UI** has no server: it calls `ctx.router.fetch(new Request('http://acryl.test/api/notes', ...))` and
  `count.subscribe(...)` in process. The same handler answers with the same status, headers and body.
- **Unloading `notes`** removes the route, the mount, the cell and any open stream. Nothing else is touched.

## Conventions that make it predictable

1. **Registrations belong to the plugin that made them.** A route, middleware, mount or cell created from a plugin's context is
   released when that plugin's fiber unloads (it is one `ctx.effect` with a disposer).
2. **Label what you register.** `ctx.effect(fn, 'my-plugin: what this is')`. The inspector reads those labels, so the
   contract of a plugin is derived from the running system rather than written a second time.
3. **Ask for HTTP, do not require it.** Register routes in `apply`; mount them over HTTP through an inner `ctx.inject(['routerHttp'], ...)`.
4. **Transport facts travel beside the request.** The peer address and the real local port are `connectionOf(c)`, supplied by the
   adapter from the socket. A header is never trusted for them. An in-process call has none, and a handler that needs a trusted
   peer (the Market does) refuses it.
5. **Nothing outlives its owner.** Unloading a plugin ends the requests and streams its code is serving, and disposing the router ends
   all of them: their `c.req.raw.signal` aborts, open bodies are cancelled, and the unload waits for them and their
   `c.executionCtx.waitUntil` work (bounded by `disposeGraceMs`).

## What is proved, and how

The framework's own tests named here are in [the acrylblends repository](https://github.com/acrylblends/acrylblends) at the same paths
(`plugins/acryl-router-http/tests/...`); the Market's are in this repository.

| Claim | Evidence |
| --- | --- |
| One handler gives identical results over HTTP and in process | `acryl-router-http/tests/surfaces.spec.ts` |
| Routes vanish on unload, reload registers once, 50 cycles return to baseline | the router's conformance suite, run on the pure core, through Cordis, and against the real Market with the real `webServer` |
| The Market works on the router | `cordis-plugin-market`: all 285 tests, plus `router-stack.spec.ts` with the real `webServer`, adapter and plugin over real HTTP |
| Server-sent events work end to end and end cleanly | `acryl-router-http/tests/stream.spec.ts`, `acryl-state/tests/service.spec.ts` |
| The inspector tells the truth | `acryl-inspect/tests/service.spec.ts` compares its "removes N registrations" with what the router really lost |

## Where the docs are

The framework lives in its own repository since spec 049 slice 17, and ACRYL consumes it as the published `acrylblends` package. Its
documentation is [`docs/framework/` in acrylblends](https://github.com/acrylblends/acrylblends/tree/main/docs/framework): getting started, concepts, routing, context, request, middleware, validation,
helpers, the Node server, plugin lifecycle, surfaces, and migrations from the DSH `webServer` and from 0.3. A copyable starter is
`examples/acryl-framework-starter`; the packages' own structure checks and suites run in acrylblends.

## In every Blend

The Blank Blueprint carries a `framework-kit` row (router, HTTP adapter, state, inspector) on the Web and Desktop surfaces, so the IDE and everything
grown from Blank start on the framework. On Desktop the window loads from the Host's own loopback web server, so a plugin's routes reach Desktop through
the same `acrylblends/cordis/router-http` mount as Web (proved live, spec 047 P7: `examples/acryl-todo` as an app plugin, full CRUD and its page in the Desktop window). A real isolated boot of the IDE Blueprint served `/api/inspect/plugins` (355 plugins listed) and `/api/state`, the Market routes
through the router, and refused a foreign `Host` with 403.

## What is not done

- The terminal UI composes no `framework-kit` row yet.
- A Desktop transport without a port (`protocol.handle` onto `router.fetch`): `specs/047-framework-port/plan.md` T014.
- A terminal command that calls `router.fetch`; the in-process path is proved in tests, not wired into the TUI.
- Other users of the DSH `webServer`: Desktop's own renderer routes, `acryl-agent-control` (through the `acrylWeb` carrier), plugin
  admin, support and the sign-in callback. They keep working unchanged and move one at a time (spec 047, Phase 8). `acryl-workspace`
  moved first: its 24 routes are one router mount, and only its terminal WebSocket is still a webServer upgrade.
- The inspector's label convention is applied to the router, state and Market registrations, not yet to every plugin.
- The DOM renderer and page/SSR layers (M6) are decisions for the owner, not built.
