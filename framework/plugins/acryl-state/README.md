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
  `/api/state` over HTTP with `routerHttp`. `GET /api/state/:key/events?json=1` sends every value as JSON (without it a
  string is sent as it is), and the names `ws` and `client.js` are routes, so a cell cannot be called by either.
- **In a page: `watch`.** `import { watch } from '/api/state/client.js'`, then `const stop = watch('app.count', value => render(value))`
  (a third argument is told of a key that does not exist). The callback gets the value now and after every change; `stop()` ends
  it. One WebSocket (`GET /api/state/ws`) carries every key of the page: a WebSocket is not one of the browser's six connections
  per host, which an event stream per key would use up (eight windows of a board stream 24 things). The socket is retried with a
  delay that grows to ten seconds, subscribes every key again and does not repeat a value the page already has; a server
  that is silent for 45 seconds counts as gone. Where the socket cannot open (no `ws` package, a server that does not upgrade) each key
  is followed by its event stream, with one console warning. The page leaves its connections when it is hidden for good (the
  back/forward cache would keep them) and opens them again when it comes back. The upgrade needs a loopback peer on this port,
  a loopback `Host`, and an `Origin`, when there is one, that is exactly this app's own; a program on this machine that sends
  none is let in, and a page of another origin or a name that only resolves here (DNS rebinding) is refused with 403. `ws` is a
  dependency of the plugin and is loaded when the first socket is wanted.
- **React.** `import { useCell } from 'acryl-state/react'` and `const value = useCell(cell)`; built on `useSyncExternalStore`.
  React is an optional peer, so the core never imports it.
- **Streams end cleanly.** The stream registers with the router's `waitUntil`; a client disconnect, a plugin unload and a
  router disposal all end it and release the subscription.

Row id and package name: `acryl-state`. The reactive core (`src/cell.ts`) is about 70 lines and has no Cordis and no DOM.
