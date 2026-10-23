/**
 * The registration surface (spec 046): several handlers per route, `all` and `on`, optional-path `use`, `group`, `onError` and
 * `notFound`, `HttpError`, `request()`, and the context helpers. Everything runs through the real Cordis service, so ownership is checked too.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, HttpError, name, type Router } from '../src/index.ts'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function mount(): Promise<{ ctx: Context, router: Router }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply })
  await settle()
  return { ctx, router: ctx.router }
}

const text = async (response: Response | Promise<Response>): Promise<string> => (await response).text()

describe('registration', () => {
  it('runs route-level middleware before the handler, in order, for that route only', async () => {
    const { router } = await mount()
    const seen: string[] = []
    router.get('/a', async (_c, next) => { seen.push('m1'); return next() }, async (_c, next) => { seen.push('m2'); return next() }, c => { seen.push('h'); return c.text('a') })
    router.get('/b', c => c.text('b'))
    expect(await text(router.request('/a'))).toBe('a')
    expect(seen).toEqual(['m1', 'm2', 'h'])
    seen.length = 0
    await router.request('/b')
    expect(seen).toEqual([])
  })

  it('answers any method with all(), and a chosen set with on()', async () => {
    const { router } = await mount()
    router.all('/any', c => c.text(c.req.method))
    router.on(['GET', 'POST'], '/two', c => c.text(c.req.method))
    expect(await text(router.request('/any', { method: 'PATCH' }))).toBe('PATCH')
    expect(await text(router.request('/two', { method: 'POST' }))).toBe('POST')
    expect((await router.request('/two', { method: 'DELETE' })).status).toBe(405)
  })

  it('removes every method of an on() registration with the one remover it returns', async () => {
    const { router } = await mount()
    const remove = router.on(['GET', 'POST'], '/two', c => c.text('x'))
    const before = router.size
    remove()
    expect(before - router.size).toBe(2)
  })

  it('applies use() without a path to everything', async () => {
    const { router } = await mount()
    router.use(async (_c, next) => { const response = await next(); response.headers.set('x-seen', '1'); return response })
    router.get('/x', c => c.text('x'))
    expect((await router.request('/x')).headers.get('x-seen')).toBe('1')
    expect((await router.request('/missing')).headers.get('x-seen')).toBe('1')
  })
})

describe('group', () => {
  it('prefixes paths, nests, and scopes group middleware to the prefix', async () => {
    const { router } = await mount()
    const seen: string[] = []
    const api = router.group('/api', async (_c, next) => { seen.push('api'); return next() })
    api.get('/', c => c.text('index'))
    api.get('/items/:id', c => c.json({ id: c.param('id') }))
    const admin = api.group('/admin')
    admin.use(async (_c, next) => { seen.push('admin'); return next() })
    admin.get('/stats', c => c.text('stats'))
    router.get('/outside', c => c.text('outside'))

    expect(await text(router.request('/api'))).toBe('index')
    expect(await (await router.request('/api/items/7')).json()).toEqual({ id: '7' })
    expect(await text(router.request('/api/admin/stats'))).toBe('stats')
    expect(seen).toEqual(['api', 'api', 'api', 'admin'])
    seen.length = 0
    await router.request('/outside')
    expect(seen).toEqual([])
  })

  it('belongs to the plugin that made it: its routes vanish when that plugin unloads', async () => {
    const { ctx, router } = await mount()
    const baseline = router.size
    const fiber = ctx.plugin({
      name: 'notes',
      inject: ['router'],
      apply(c: Context) {
        const notes = c.router.group('/notes')
        notes.get('/', x => x.text('list'))
        notes.post('/', x => x.text('create', 201))
      },
    })
    await settle()
    expect(router.size - baseline).toBe(2)
    expect(await text(router.request('/notes'))).toBe('list')
    await fiber.dispose()
    await settle()
    expect(router.size).toBe(baseline)
    expect((await router.request('/notes')).status).toBe(404)
  })

  it('rejects a prefix that is not a plain path', async () => {
    const { router } = await mount()
    expect(() => router.group('/api/')).toThrow(/plain path/)
    expect(() => router.group('/a/:id')).toThrow(/plain path/)
    expect(() => router.group('/a/*')).toThrow(/plain path/)
    expect(() => router.group('api')).toThrow(/plain path/)
  })
})

describe('errors and not found', () => {
  it('turns a thrown HttpError into its response without logging an error', async () => {
    const { router } = await mount()
    router.get('/secret', () => { throw new HttpError(401, { message: 'Sign in first' }) })
    router.get('/custom', () => { throw new HttpError(418, { response: new Response('teapot', { status: 418, headers: { 'x-brew': 'yes' } }) }) })
    const denied = await router.request('/secret')
    expect(denied.status).toBe(401)
    expect(await denied.text()).toBe('Sign in first')
    const teapot = await router.request('/custom')
    expect(teapot.status).toBe(418)
    expect(teapot.headers.get('x-brew')).toBe('yes')
  })

  it('lets one onError handler own every error, including HttpError, and removes it with its plugin', async () => {
    const { ctx, router } = await mount()
    const fiber = ctx.plugin({
      name: 'errors',
      inject: ['router'],
      apply(c: Context) {
        c.router.onError((error, x) => x.json({ message: error instanceof Error ? error.message : 'unknown' }, error instanceof HttpError ? error.status : 500))
      },
    })
    await settle()
    router.get('/boom', () => { throw new Error('boom') })
    router.get('/http', () => { throw new HttpError(403, { message: 'nope' }) })
    expect(await (await router.request('/boom')).json()).toEqual({ message: 'boom' })
    const forbidden = await router.request('/http')
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ message: 'nope' })
    expect(() => router.onError(() => new Response('second'))).toThrow(/already registered/)
    await fiber.dispose()
    await settle()
    expect((await router.request('/boom')).status).toBe(500)
  })

  it('answers 500 when the error handler itself throws', async () => {
    const { router } = await mount()
    router.onError(() => { throw new Error('handler broke') })
    router.get('/boom', () => { throw new Error('boom') })
    expect((await router.request('/boom')).status).toBe(500)
  })

  it('uses a registered notFound handler, also through c.notFound()', async () => {
    const { router } = await mount()
    router.notFound(c => c.json({ missing: c.url.pathname }, 404))
    router.get('/maybe', c => c.req.headers.has('x-found') ? c.text('found') : c.notFound())
    const missing = await router.request('/nowhere')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ missing: '/nowhere' })
    expect((await router.request('/maybe')).status).toBe(404)
    expect(await text(router.request('/maybe', { headers: { 'x-found': '1' } }))).toBe('found')
    expect(() => router.notFound(() => new Response('second'))).toThrow(/already registered/)
  })
})

describe('context helpers', () => {
  it('carries header() and status() into the response helpers', async () => {
    const { router } = await mount()
    router.get('/h', c => { c.header('x-app', 'acryl'); c.status(202); return c.json({ ok: true }) })
    const response = await router.request('/h')
    expect(response.status).toBe(202)
    expect(response.headers.get('x-app')).toBe('acryl')
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('builds html, raw bodies and redirects', async () => {
    const { router } = await mount()
    router.get('/html', c => c.html('<h1>hi</h1>'))
    router.get('/raw', c => c.body(new Uint8Array([1, 2, 3]), 200, { 'content-type': 'application/octet-stream' }))
    router.get('/go', c => c.redirect('/html', 301))
    router.get('/empty', c => c.body(null, 204))
    const html = await router.request('/html')
    expect(html.headers.get('content-type')).toContain('text/html')
    expect(await html.text()).toBe('<h1>hi</h1>')
    expect([...new Uint8Array(await (await router.request('/raw')).arrayBuffer())]).toEqual([1, 2, 3])
    const moved = await router.request('/go')
    expect(moved.status).toBe(301)
    expect(moved.headers.get('location')).toBe('/html')
    expect((await router.request('/empty')).status).toBe(204)
  })

  it('reads query and path parameters one at a time or all at once', async () => {
    const { router } = await mount()
    router.get('/u/:name', c => c.json({ one: c.query('q'), all: c.query(), name: c.param('name'), params: c.param() }))
    const body = await (await router.request('/u/zed?q=1&q=2&r=3')).json()
    expect(body).toEqual({ one: '1', all: { q: '1', r: '3' }, name: 'zed', params: { name: 'zed' } })
  })

  it('shares values between middleware and handler with set() and get()', async () => {
    const { router } = await mount()
    router.use(async (c, next) => { c.set('user', 'ada'); return next() })
    router.get('/me', c => c.text(c.get<string>('user') ?? '?'))
    expect(await text(router.request('/me'))).toBe('ada')
  })
})

describe('request()', () => {
  it('accepts a relative path, a URL, and a Request, with init and connection info', async () => {
    const { router } = await mount()
    router.post('/echo', async c => c.json({ got: await c.req.text(), peer: c.connection.remoteAddress ?? null }))
    const viaPath = await router.request('/echo', { method: 'POST', body: 'a' })
    expect(await viaPath.json()).toEqual({ got: 'a', peer: null })
    const viaUrl = await router.request(new URL('http://example.test/echo'), { method: 'POST', body: 'b' }, { remoteAddress: '127.0.0.1' })
    expect(await viaUrl.json()).toEqual({ got: 'b', peer: '127.0.0.1' })
    const viaRequest = await router.request(new Request('http://example.test/echo', { method: 'POST', body: 'c' }))
    expect((await viaRequest.json() as { got: string }).got).toBe('c')
  })
})
