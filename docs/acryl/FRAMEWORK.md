# The ACRYL Framework: the building blocks and how they fit

Status: first working slice on branch `046-acryl-framework` (spec 046). This page is the map a person can hold in their head.
Rules and decisions: `specs/046-microframework-to-rewrite-all-via-cordis-plugins-as-acryl-framework/`.

## The idea in one paragraph

ACRYL keeps Cordis as its only plugin system and lifecycle, keeps React for graphical UI, and adds a small set of services on
top that every surface (Web, Desktop, terminal) can use the same way. Each service is a Cordis plugin, small enough to read in
an evening, and every registration a plugin makes disappears when that plugin unloads.

## The blocks

| Block | Package | What it gives a plugin author | Size |
| --- | --- | --- | --- |
| Lifecycle | Cordis (`@deepseek-ai/cordis`) | plugins, `inject`, effects with disposers, PENDING until dependencies exist | the existing foundation |
| Routing | `acryl-router` | `ctx.router.get('/x', c => c.json(...))`, middleware, in-process `ctx.router.fetch(request)` | about 440 lines of source, comments included |
| Web adapter | `acryl-router-http` | `ctx.routerHttp.mount('/api/x')` serves those routes over the DSH `webServer` | about 145 lines |
| Shared state | `acryl-state` | observable cells (`ctx.state.cell`), derived cells, JSON and server-sent-event routes, a React hook | about 200 lines |
| Introspection | `acryl-inspect` | what every plugin requires, provides and registers, and what unloads with it | about 170 lines |

React, Vite, Electron, `pi-tui` and typert are unchanged.

## One plugin, every surface

```ts
export const name = 'notes'
export const inject = ['router', 'state']

export function apply(ctx: Context): void {
  const count = ctx.state.cell('notes.count', 0)

  ctx.router.post('/api/notes', async c => {                 // Web-standard Request in, Response out
    count.update(n => n + 1)
    return c.json({ saved: (await c.req.text()).length }, 201)
  })

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
4. **Transport facts travel beside the request.** The peer address and the real local port are `c.connection`, supplied by the
   adapter from the socket. A header is never trusted for them. An in-process call has none, and a handler that needs a trusted
   peer (the Market does) refuses it.
5. **Long-lived responses say so.** A streaming handler registers `c.waitUntil(promise)` for the life of the stream; disposing the
   router aborts `c.signal` and waits for it (bounded by `disposeGraceMs`).

## What is proved, and how

| Claim | Evidence |
| --- | --- |
| One handler gives identical results over HTTP and in process | `acryl-router-http/tests/surfaces.spec.ts` |
| Routes vanish on unload, reload registers once, 50 cycles return to baseline | `acryl-router` conformance suite, run on the pure core, through Cordis, and against the real Market with the real `webServer` |
| The Market works on the router | `cordis-plugin-market`: all 285 tests, plus `router-stack.spec.ts` with the real `webServer`, adapter and plugin over real HTTP |
| Server-sent events work end to end and end cleanly | `acryl-router-http/tests/stream.spec.ts`, `acryl-state/tests/service.spec.ts` |
| The inspector tells the truth | `acryl-inspect/tests/service.spec.ts` compares its "removes N registrations" with what the router really lost |

## Where the docs are

The Hono-shaped documentation tree is `docs/framework/` (getting started, concepts, API, guides, middleware and helpers, a Hono parity table).
A copyable starter is `examples/acryl-framework-starter`. `node scripts/verify-framework.mjs` (in `check:layout`) enforces the shape of every framework package.

## In every Blend

The Blank Blueprint carries a `framework-kit` row (router, HTTP adapter, state, inspector) on the Web surface, so the IDE and everything grown from Blank
start on the framework. A real isolated boot of the IDE Blueprint served `/api/inspect/plugins` (355 plugins listed) and `/api/state`, the Market routes
through the router, and refused a foreign `Host` with 403.

## What is not done

- Desktop and the terminal UI compose no `framework-kit` row yet (Web only); the Market is the Desktop consumer.
- A terminal command that calls `router.fetch`; the in-process path is proved in tests, not wired into the TUI.
- Other users of the DSH `webServer`: Desktop's own renderer routes, `acryl-agent-control` (through the `acrylWeb` carrier) and the
  sign-in callback. They keep working unchanged.
- The inspector's label convention is applied to the router, state and Market registrations, not yet to every plugin.
- The DOM renderer and page/SSR layers (M6) are decisions for the owner, not built.
