/**
 * The examples `docs/framework/` relies on, run as written: if one of these fails, the page that shows it is wrong.
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z as zod } from 'zod'
import { createMiddleware, getCookie, html, schemaValidator, testClient, validator } from '../src/helpers/index.ts'
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

describe('guides/validation.md, validating an HTML form', () => {
  const page = (error?: string) => html`<!doctype html>
  <form method="post" action="/notes" enctype="multipart/form-data">
    <input name="title" required>
    <textarea name="body"></textarea>
    <input type="file" name="attachment">
    <button>Save</button>
    ${error === undefined ? '' : html`<p role="alert">${error}</p>`}
  </form>`

  const app = new Acryl()
    .get('/notes/new', c => c.html(page()))
    .post(
      '/notes',
      validator('form', (form, c) => {
        const { title, body, attachment } = form
        if (typeof title !== 'string' || title.trim() === '') return c.html(page('Title is required'), 400)
        if (body !== undefined && typeof body !== 'string') return c.html(page('Body must be text'), 400)
        if (attachment !== undefined && !(attachment instanceof File)) return c.html(page('Attachment must be one file'), 400)
        return {
          title: title.trim(),
          body: body ?? '',
          attachment: attachment !== undefined && attachment.size > 0 ? attachment : undefined,
        }
      }),
      c => {
        const { title, attachment } = c.req.valid('form')
        expectTypeOf(c.req.valid('form')).toEqualTypeOf<{ title: string, body: string, attachment: File | undefined }>()
        return c.text(`Saved ${title}${attachment === undefined ? '' : ` with ${attachment.name}`}`, 201)
      },
    )

  const NoteForm = zod.object({
    title: zod.string().trim().min(1, 'Title is required'),
    body: zod.string().default(''),
    attachment: zod.instanceof(File).optional(),
  })
  app.post('/api/notes', schemaValidator('form', NoteForm), c => {
    const { title } = c.req.valid('form')
    expectTypeOf(title).toEqualTypeOf<string>()
    return c.json({ title }, 201)
  })
  const reRendering = new Acryl().post('/notes', validator('form', (form, c) => {
    const result = NoteForm.safeParse(form)
    return result.success ? result.data : c.html(page(result.error.issues[0]?.message), 400)
  }), c => c.json(c.req.valid('form')))

  it('serves the form', async () => {
    expect(await (await app.request('/notes/new')).text()).toContain('<input type="file" name="attachment">')
  })

  it('takes a multipart post with a file, as the page tests it', async () => {
    const form = new FormData()
    form.set('title', 'Groceries')
    form.set('attachment', new File(['milk'], 'list.txt', { type: 'text/plain' }))
    const res = await app.request('/notes', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('Saved Groceries with list.txt')
  })

  it('takes a urlencoded post and treats an empty file part as no file', async () => {
    const urlencoded = await app.request('/notes', { method: 'POST', body: new URLSearchParams({ title: ' Groceries ', body: 'milk' }) })
    expect(await urlencoded.text()).toBe('Saved Groceries')
    // The bytes a browser sends for an empty file input (Node's own FormData leaves out filename="" for a nameless File).
    const browserBody = [
      '--B', 'Content-Disposition: form-data; name="title"', '', 'Groceries',
      '--B', 'Content-Disposition: form-data; name="attachment"; filename=""', 'Content-Type: application/octet-stream', '', '',
      '--B--', '',
    ].join('\r\n')
    const empty = await app.request('/notes', { method: 'POST', body: browserBody, headers: { 'content-type': 'multipart/form-data; boundary=B' } })
    expect(await empty.text()).toBe('Saved Groceries')
  })

  it('re-renders the page with an escaped message when a field is wrong', async () => {
    const res = await app.request('/notes', { method: 'POST', body: new URLSearchParams({ title: '' }) })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('<p role="alert">Title is required</p>')
    const twice = new URLSearchParams([['title', 'a'], ['title', 'b']])
    expect(await (await app.request('/notes', { method: 'POST', body: twice })).text()).toContain('Title is required')
    const escaped = await reRendering.request('/notes', { method: 'POST', body: new URLSearchParams({ title: '' }) })
    expect(await escaped.text()).toContain('<p role="alert">Title is required</p>')
    expect(html`${'<b>'}`.toString()).toBe('&lt;b&gt;')
  })

  it('answers JSON issues from schemaValidator(\'form\', ...)', async () => {
    const ok = await app.request('/api/notes', { method: 'POST', body: new URLSearchParams({ title: 'x' }) })
    expect(await ok.json()).toEqual({ title: 'x' })
    const bad = await app.request('/api/notes', { method: 'POST', body: new URLSearchParams({ title: ' ' }) })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid form', issues: [{ message: 'Title is required', path: 'title' }] })
  })
})

describe('helpers/testing.md', () => {
  it('sends default headers with every request of a test client', async () => {
    const app = new Acryl().get('/me', c => c.json({ session: getCookie(c, 'session') ?? null }))
    const client = testClient(app, undefined, undefined, { headers: { cookie: 'session=abc' } })
    expect(await (await client.me.$get()).json()).toEqual({ session: 'abc' })
    // Per-request headers are merged over the defaults.
    expect(await (await client.me.$get(undefined, { headers: { cookie: 'session=xyz' } })).json()).toEqual({ session: 'xyz' })
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
