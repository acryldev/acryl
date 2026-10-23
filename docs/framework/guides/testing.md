# Testing

No socket needed: `ctx.router.request(path, init)` runs the whole stack (middleware, handler, error handling) and returns a `Response`.

```ts
const ctx = new Context()
ctx.plugin({ name: routerName, apply: routerApply })
ctx.plugin(notes)
const res = await ctx.router.request('/api/notes', { method: 'POST', body: JSON.stringify({ title: 'x' }), headers: { 'content-type': 'application/json' } })
expect(res.status).toBe(201)
```

- A guard that needs a socket peer (`loopbackOnly`) sees an in-process call; pass facts as the third argument: `request(path, init, { remoteAddress: '127.0.0.1', localPort: 3290 })`.
- Leak check: `router.size` before mount, after mount, after `fiber.dispose()` must return to the first value.
- Real HTTP: mount `acryl-router-http` on a real `webServer` (see `acryl-router-http/tests/surfaces.spec.ts`).
- Disposal: `await ctx.fiber.dispose()` aborts open requests and waits for them (bounded by `disposeGraceMs`).
