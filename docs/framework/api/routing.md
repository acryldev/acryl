# Routing

```ts
ctx.router.get('/a/:id', c => c.json({ id: c.param('id') }))
ctx.router.post('/a', auth, async c => c.json(await readJson(c), 201))   // leading middleware, last argument is the handler
ctx.router.on(['GET', 'PUT'], '/b', handler)
ctx.router.all('/c/*', handler)                                          // any method; `*` is the last segment only
ctx.router.use('/a', async (c, next) => { const r = await next(); r.headers.set('x-a', '1'); return r })

const api = ctx.router.group('/api/notes', loopbackOnly())               // prefix + middleware for everything below
api.get('/', list)
api.group('/:id').get('/history', history)
```

Every call returns a remover; all are also removed when the calling plugin unloads. Paths are exact (`/a` and `/a/` differ) unless the router is configured with
`trailingSlash: 'ignore'`. A group prefix has static segments only.
