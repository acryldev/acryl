# acryl-inspect

What every running plugin **requires**, **provides** and **registers**, and what unloads with it, read from the running
system (spec 046, milestone M4). There is no second declaration to keep in step with the code: Cordis already holds a
plugin's name, its state, the services it waits for, and a labeled tree of everything it registered.

```ts
ctx.inspect.plugins()          // PluginReport[] for every live plugin instance
ctx.inspect.explain('market')  // text for one plugin
ctx.inspect.render()           // the whole system as text
```

```text
demo-market (ACTIVE)
  needs:     router
  provides:  nothing
  routes:    GET /api/demo/state, POST /api/demo/sources
  middleware: /api/demo
  unloading: removes 3 registrations and nothing else
```

## The one convention

An effect says what it is, prefixed by its owner: `acryl-router: GET /a`, `acryl-router: use /api`, and Cordis labels its own
(`ctx.provide("router")`). The inspector sorts labels into provides, routes, middleware and everything else. A plugin that
registers a resource through `ctx.effect(fn, 'my-plugin: what this is')` is described for free; one that registers with no
label shows as `anonymous` in "also".

## On every surface

With a router present it adds `GET /api/inspect/plugins` (JSON) and `GET /api/inspect/plugins/:name` (text), so the terminal UI
can read them with `ctx.router.fetch` and no server. They are not served over HTTP unless some plugin mounts the
`/api/inspect` prefix with `routerHttp`.

## A check built into the tests

`removedOnUnload` is a promise: the test mounts a plugin, reads that number, unloads the plugin, and compares it with what
the router really lost. A report that drifts from reality fails there.

Row id and package name: `acryl-inspect`.
