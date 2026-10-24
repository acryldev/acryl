/**
 * The examples `docs/framework/` relies on, run as written: if one of these fails, the page that shows it is wrong.
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { afterEach, describe, expect, it } from 'vitest'
import { createMiddleware, schemaValidator, testClient } from '../src/helpers/index.ts'
import { Acryl, HTTPException, apply, name } from '../src/index.ts'
import { methodNotAllowed } from '../src/middleware/index.ts'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function withPlugin(plugin: { name: string, inject: string[], apply(ctx: Context): void }): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply })
  ctx.plugin(plugin)
  await settle()
  return ctx
}

describe('getting-started.md', () => {
  it('serves the minimal plugin as the route table says', async () => {
    const ctx = await withPlugin({
      name: 'todo',
      inject: ['router'],
      apply(inner) {
        const app = new Acryl()
          .get('/', c => c.json({ ok: true }))
          .get('/todos/:id', c => c.json({ id: c.req.param('id') }))
        inner.router.route('/todo', app)
        inner.inject(['routerHttp'], deeper => { deeper.routerHttp.mount('/todo') })
      },
    })
    expect(await (await ctx.router.request('/todo')).json()).toEqual({ ok: true })
    expect(await (await ctx.router.request('/todo/todos/42')).json()).toEqual({ id: '42' })
    expect((await ctx.router.request('/todo/')).status).toBe(404)
  })
})

describe('routing.md', () => {
  it('serves the routes an app had at the mount, not ones added later', async () => {
    const app = new Acryl().get('/a', c => c.text('a'))
    const ctx = await withPlugin({ name: 'late', inject: ['router'], apply(inner) { inner.router.route('/x', app) } })
    app.get('/b', c => c.text('b'))
    expect((await ctx.router.request('/x/a')).status).toBe(200)
    expect((await ctx.router.request('/x/b')).status).toBe(404)
  })

  it('answers a wrong method with 404, or 405 and Allow with methodNotAllowed', async () => {
    const plain = new Acryl().get('/item', c => c.text('item'))
    expect((await plain.request('/item', { method: 'POST' })).status).toBe(404)
    const strict = new Acryl()
    strict.use(methodNotAllowed({ app: strict })).get('/item', c => c.text('item'))
    const response = await strict.request('/item', { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('GET')

    const ctx = await withPlugin({ name: 'items', inject: ['router'], apply(inner) { inner.router.route('/shop', strict) } })
    const mounted = await ctx.router.request('/shop/item', { method: 'POST' })
    expect(mounted.status).toBe(405)
    expect(mounted.headers.get('allow')).toContain('GET')
    expect((await ctx.router.request('/shop/item')).status).toBe(200)
  })

  it('uses a mounted app\'s onError for its routes', async () => {
    const app = new Acryl().get('/boom', () => { throw new Error('boom') })
    app.onError((_error, c) => c.json({ error: 'internal_error' }, 500))
    const ctx = await withPlugin({ name: 'errors', inject: ['router'], apply(inner) { inner.router.route('/', app) } })
    expect(await (await ctx.router.request('/boom')).json()).toEqual({ error: 'internal_error' })
  })
})

describe('context.md and middleware.md', () => {
  it('passes typed variables from middleware to the handler', async () => {
    const withUser = createMiddleware<{ Variables: { user: { name: string } } }>(async (c, next) => {
      c.set('user', { name: 'ada' })
      await next()
    })
    const app = new Acryl().use(withUser).get('/me', c => c.json(c.var.user))
    expect(await (await app.request('/me')).json()).toEqual({ name: 'ada' })
  })

  it('never throws from next(): the error is already a response and is left in c.error', async () => {
    let caught = false
    let seen: unknown
    const app = new Acryl()
      .use(async (c, next) => {
        try {
          await next()
        } catch {
          caught = true
        }
        seen = c.error
      })
      .get('/', () => { throw new Error('boom') })
    expect((await app.request('/')).status).toBe(500)
    expect(caught).toBe(false)
    expect(seen).toBeInstanceOf(Error)
  })

  it('turns an HTTPException into its own response', async () => {
    const app = new Acryl().get('/', () => { throw new HTTPException(403, { message: 'not yours' }) })
    const response = await app.request('/')
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('not yours')
  })
})

describe('validation.md', () => {
  const NewTodo = z.object({
    title: z.string().required(),
    done: z.boolean().default(false),
  })
  const app = new Acryl().post('/todos', schemaValidator('json', NewTodo), c => c.json({ todo: c.req.valid('json') }, 201))
  const post = (body: string, type?: string): Promise<Response> =>
    Promise.resolve(app.request('/todos', { method: 'POST', body, headers: type === undefined ? {} : { 'content-type': type } }))

  it('hands the handler the schema output', async () => {
    const response = await post('{"title":"hello"}', 'application/json')
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ todo: { title: 'hello', done: false } })
  })

  it('answers 400 with the issues the page shows', async () => {
    const response = await post('{"title":1}', 'application/json')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid json', issues: [{ message: '$.title expected string but got 1', path: 'title' }] })
  })

  it('validates {} when the request is not JSON, so a required field fails', async () => {
    expect((await post('{"title":"hello"}')).status).toBe(400)
  })

  it('answers 400 for a body that is not JSON', async () => {
    expect((await post('{', 'application/json')).status).toBe(400)
  })
})

describe('helpers.md', () => {
  it('calls a chained app through the typed test client', async () => {
    const app = new Acryl().get('/search', c => c.json({ query: c.req.query('q') }))
    const client = testClient(app)
    const response = await client.search.$get({ query: { q: 'cordis' } })
    expect(await response.json()).toEqual({ query: 'cordis' })
  })
})
