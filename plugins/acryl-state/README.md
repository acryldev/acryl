# acryl-state

Observable cells owned by plugins, shared by every surface (spec 046, milestone M5).

```ts
export const inject = ['state']

export function apply(ctx: Context): void {
  const title = ctx.state.cell('app.title', 'Untitled')          // writable, owned by this plugin
  const loud = ctx.state.derive('app.title-loud', [title] as const, t => t.toUpperCase())
  title.set('Hello')                                              // loud.get() === 'HELLO'
}
```

- **Owned.** A cell made from a plugin's context is removed when that plugin unloads; nothing keeps a value alive for a plugin
  that is gone. Keys are dotted lowercase words (`market.sources`) and unique.
- **In process (terminal UI, other plugins).** `cell.get()`, `cell.subscribe(fn)`. A subscriber that throws is logged and the
  others still run. A set to an equal value (`Object.is`) notifies nobody.
- **Over the router (Web and Desktop).** With a router present: `GET /api/state` (keys), `GET /api/state/:key` (value) and
  `GET /api/state/:key/events`, a server-sent event stream that sends the value now and every change. The routes are
  read-only: only the Host plugin that owns a cell writes it. They are reachable in process unless some plugin mounts
  `/api/state` over HTTP with `routerHttp`.
- **React.** `import { useCell } from 'acryl-state/react'` and `const value = useCell(cell)`; built on `useSyncExternalStore`.
  React is an optional peer, so the core never imports it.
- **Streams end cleanly.** The stream registers with the router's `waitUntil`; a client disconnect, a plugin unload and a
  router disposal all end it and release the subscription.

Row id and package name: `acryl-state`. The reactive core (`src/cell.ts`) is about 70 lines and has no Cordis and no DOM.
