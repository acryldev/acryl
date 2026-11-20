# Plugin lifecycle and disposal

Cordis gives every framework registration an owner and a lifetime. This is the main difference between using the application API on its
own and using it as part of ACRYL.

## Every registration has an owner

```ts
export const name = 'todo'
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.route('/todo', createTodoApp())
}
```

`route`, `onError` and `notFound` register themselves as effects of the plugin that called them, so there is nothing to wrap: when the
plugin's fiber unloads, its mount goes away, and a reload mounts it again without duplicates. `route` returns a function that removes the
mount sooner. Never register routes as a side effect of importing a module.

Resources an app uses (timers, watchers, connections, subprocesses) belong to one `ctx.effect()` of the plugin, whose disposer releases
them:

```ts
export function apply(ctx: Context): void {
  const events = new EventEmitter()
  ctx.effect(() => {
    const timer = setInterval(() => events.emit('tick'), 1000)
    return () => clearInterval(timer)
  }, 'todo: ticker')
  ctx.router.route('/todo', createTodoApp(events))
}
```

## Live composition

The router is built for a host whose plugin set changes while it runs. Mounts are added and removed, and each request after a change is
served by an app composed from the mounts that are live at that time; a request already running keeps the app it started with. The core's
route tables only grow, so the router rebuilds the composition instead of editing it. Application code does not manage this.

A mount is a snapshot of the app's routes at the `route` call. Build the app, then mount it.

## Missing providers

A plugin that injects `router` stays PENDING while no router exists. That is a normal Cordis state, not an error: when a router appears the
plugin activates and mounts. When the router is replaced, the plugin unloads and activates again against the new one, so it must not keep
the old service object anywhere else.

## Disposal sequence

When a plugin that owns a mount unloads:

1. The mount leaves the composition, so new requests no longer reach it.
2. The requests its code is still serving end: a request inside one of its handlers or middleware (before `next()` returned), and a
   response body one of its handlers produced. Their signals abort (`c.req.raw.signal`) and their bodies are cancelled, which runs the
   stream helpers' `onAbort`.
3. The unload waits for those requests, their bodies and their `c.executionCtx.waitUntil` work, bounded by the router's `disposeGraceMs`.

A request the plugin's middleware already passed on to another plugin's handler is not touched. When the router itself is disposed, the
same happens to every running request, and new requests are answered with 503.

Handlers get a chance to release their resources, nothing a plugin started outlives it, and disposal cannot hang forever.

## Services and the shadow context

A plugin reaches a service through its own view of it: `ctx.router` in one plugin and in another are two different objects over one
service. Two facts follow, each with a test as proof.

**Fields are shared.** Reading or assigning a service's field through any plugin's view reads or writes the one instance, so every caller
sees the same value (`plugins/acryl-router/tests/shadow-state.spec.ts`). Keeping changing state in one object, as the router does, is a
readability choice, not a requirement.

**`this.ctx` inside a method is the caller's view, not the service's own context.** It is what lets `route` tie a mount to the plugin
that called it. It is the wrong context for starting something that should belong to the service: a plugin started with
`this.ctx.plugin(...)` from a method resolves services as the service's own fiber and fails with "cannot get property router without
inject". Keep the context the constructor received and use that:

```ts
class Installer extends Service {
  private readonly owner: Context

  constructor(ctx: Context) {
    super(ctx, 'installer')
    this.owner = ctx                  // the service's own context
  }

  async install(plugin: Plugin): Promise<void> {
    await this.owner.plugin(plugin)   // right: behaves like a plugin mounted at startup
    // await this.ctx.plugin(plugin)  // wrong: the caller's view, see above
  }
}
```

The proof is `plugins/acryl-router/tests/live-install.spec.ts`, which runs both forms against a live router. This sits next to the general
rule: a plugin started with `this.ctx.plugin(...)` in `apply` is a child of the plugin and unloads with it.

## Module state

Do not hide mutable state in module globals. Cordis can reload a plugin and run several surfaces from one host, and a module global
outlives the plugin that wrote it.

## What to test

Test a route-owning plugin through real Cordis activation for:

- activation when the router is present, and PENDING until it appears;
- route removal after the plugin unloads, and a clean mount after reload, without duplicates over repeated cycles;
- router replacement without stale service references;
- disposal while a response is still open.

`app.request` tests prove handler behavior. Only activation tests prove ownership.
