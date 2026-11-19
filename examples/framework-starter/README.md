# acryl-framework-starter

Copy this folder to start a plugin on the ACRYL Framework (see [the framework docs](https://github.com/acrylblends/acrylblends/tree/main/docs/framework)). It has one route, one state cell and a test that needs no socket.

```ts
export const name = 'acryl-framework-starter'
export const inject = ['router', 'state']

export function apply(ctx: Context): void {
  const visits = ctx.state.cell('starter.visits', 0)
  const app = new Acryl().get('/hello/:who', c => { visits.update(n => n + 1); return c.json({ hello: c.req.param('who'), visits: visits.get() }) })
  ctx.router.route('/api/starter', app)
  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/starter') })
}
```

To make it yours: rename the folder and the `name`, change the row `id` and `name` in `cordis.patch.yml` to the new package name, and edit `src/index.ts`.
Run `pnpm test` here. In an app, add the row to the app's Loader configuration; the Blank base kit already carries the router, state and the HTTP adapter.
