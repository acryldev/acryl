# Getting started

A plugin is a module with a `name`, an optional `inject` list, and `apply(ctx)`.

```ts
// plugins/hello/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-router'

export const name = 'hello'
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.get('/api/hello/:who', c => c.json({ hello: c.param('who') }))
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/hello') })   // over HTTP only where an adapter exists
}
```

## Mount it

In a Blend, add a row to its `cordis.patch.yml` (the row id is the package name):

```yaml
- insert:
    - id: hello
      name: hello
```

`acryl new my-app` scaffolds an app whose `plugins/` folder is where such packages live. A Blank app already carries the router, the HTTP
adapter, state and the inspector, so `hello` works as soon as it is mounted.

## Call it

- Over HTTP (Web, Desktop): `curl http://127.0.0.1:<port>/api/hello/world`
- In process (terminal UI, tests): `await ctx.router.request('/api/hello/world')` returns a `Response`.

## Test it (no socket)

```ts
const ctx = new Context()
ctx.plugin(routerPlugin)
ctx.plugin(helloPlugin)
const res = await ctx.router.request('/api/hello/world')
expect(await res.json()).toEqual({ hello: 'world' })
```

## Look inside

`GET /api/inspect/plugins/hello` (from the same machine) prints what `hello` needs, provides and registers, and what unloading it removes.
Unload the plugin and the route, the mount and everything else it made are gone.
