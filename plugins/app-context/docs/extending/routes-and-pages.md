# Routes and pages

A plugin's routes are an `Acryl` app (the app's web framework, documented in `docs/framework/` of this app) mounted on the app's router.

```ts
import { Acryl } from 'acrylblends'

export const inject = ['router']

export function apply(ctx: Context): void {
  const app = new Acryl()
    .get('/', (c) => c.html(page))                       // GET /hello
    .get('/greeting', (c) => c.json({ text: 'Hello' }))  // GET /hello/greeting
    .post('/items', async (c) => {
      const body = await c.req.json()
      return c.json(body, 201)
    })
  ctx.router.route('/hello', app)
}
```

- Mount under one prefix of the plugin's own, named after it (`/hello`, `/notes`). Never mount `/` or a path another plugin or `src/routes.ts`
  answers (`/`, `/about`, `/health`).
- `ctx.router.route` returns nothing to keep: the mount is removed when the plugin goes.
- Write the app's own paths. In the frame the same routes answer under `/app`, and the canvas page's requests for `/hello/...` (links, forms,
  `fetch`, scripts) are served there: never write `/app` in a route, a link or a fetch.
- Answer JSON with `c.json(value, status)`, a page with `c.html(text)`, nothing with `c.body(null, 204)`. A bad input is a 400 with
  `{ error: '...' }`, never a thrown error.
- A page is a full HTML document (`<!doctype html>...`). Escape user text before it goes into HTML.
- Middleware (body limits, CORS, cookies) and the request API: `docs/framework/` in this app (`docs/framework/README.md` is its index).

Example: `../example-plugins/packages/route-page-basic/`. To show something on the app's first screen rather than on a page of its own, use
[a home widget](home-widget.md).
