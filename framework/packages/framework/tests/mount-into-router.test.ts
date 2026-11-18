// An app built from this package (the code `acrylblends` publishes) mounts into a Cordis plugin's `ctx.router`: TypeScript accepts it,
// although its classes are another copy of the framework's (nominal, for their private members), and the router serves its routes, its
// middleware and its own `onError`. Run after the build: `lib/` is what the tarball ships.

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { apply, name } from 'acryl-router'
import { Acryl } from '../lib/index.js'
import { HTTPException } from '../lib/http-exception.js'
import { cors } from '../lib/cors.js'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function router(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply }, { trailingSlash: 'strict', disposeGraceMs: 2000 })
  await new Promise(resolve => setTimeout(resolve, 0))
  return ctx
}

test('an app from the published package mounts into ctx.router and is served with its middleware and onError', async () => {
  const ctx = await router()
  const app = new Acryl()
    .use('/api/*', cors({ origin: 'https://example.test' }))
    .get('/api/hello', c => c.json({ message: 'Acryl!' }))
    .get('/api/teapot', () => { throw new HTTPException(418, { message: 'short and stout' }) })
  app.onError((error, c) => c.json({ error: error.message }, error instanceof HTTPException ? error.status : 500))

  const unmount = ctx.router.route('/', app)

  const hello = await ctx.router.fetch(new Request('http://127.0.0.1/api/hello', { headers: { origin: 'https://example.test' } }))
  assert.equal(hello.status, 200)
  assert.deepEqual(await hello.json(), { message: 'Acryl!' })
  assert.equal(hello.headers.get('access-control-allow-origin'), 'https://example.test')

  const teapot = await ctx.router.fetch(new Request('http://127.0.0.1/api/teapot'))
  assert.equal(teapot.status, 418)
  assert.deepEqual(await teapot.json(), { error: 'short and stout' })

  unmount()
  assert.equal((await ctx.router.fetch(new Request('http://127.0.0.1/api/hello'))).status, 404)
})
