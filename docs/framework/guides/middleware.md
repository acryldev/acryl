# Middleware

```ts
import type { Middleware } from 'acryl-router'

const timing: Middleware = async (c, next) => {
  const start = performance.now()
  const response = await next()                          // call once
  response.headers.set('server-timing', `total;dur=${(performance.now() - start).toFixed(1)}`)
  return response
}
ctx.router.use('/api', timing)
```

- Middleware runs in registration order, outermost first. Returning without calling `next()` short-circuits (a guard).
- Share values with the handler through `c.set` / `c.get`.
- A middleware registered by a plugin is removed when that plugin unloads.
- Built-ins: see [Middleware](../middleware/README.md).
