/**
 * The framework-neutral conformance suite for a `router` (spec 046, milestone M0). A candidate is one factory returning
 * five operations; the same checks run against every implementation, so choosing between the rewrite, H3 or
 * a Rou3-based core is a matter of one adapter function and a test run.
 */

import { describe, expect, it } from 'vitest'
import type { Handler, Middleware, RouteMethod } from '../src/types.ts'

export interface Candidate {
  route(method: RouteMethod, path: string, handler: Handler): () => void
  use(path: string, middleware: Middleware): () => void
  fetch(request: Request): Promise<Response>
  /** Routes plus middleware currently registered. */
  size(): number
}

const req = (path: string, method = 'GET'): Request => new Request(`http://acryl.test${path}`, { method })
const body = async (response: Response): Promise<string> => response.text()
const echo = (label: string): Handler => c => c.text(`${label}:${JSON.stringify(c.params)}`)

export function conformance(label: string, make: () => Promise<Candidate> | Candidate): void {
  describe(`router conformance: ${label}`, () => {
    it('matches exact, parameter and wildcard routes and decodes parameters', async () => {
      const r = await make()
      r.route('GET', '/', echo('root'))
      r.route('GET', '/market', echo('market'))
      r.route('GET', '/market/:id', echo('item'))
      r.route('GET', '/files/*', echo('files'))
      expect(await body(await r.fetch(req('/')))).toBe('root:{}')
      expect(await body(await r.fetch(req('/market')))).toBe('market:{}')
      expect(await body(await r.fetch(req('/market/a%20b')))).toBe('item:{"id":"a b"}')
      expect(await body(await r.fetch(req('/files/a/b/c')))).toBe('files:{"*":"a/b/c"}')
      expect((await r.fetch(req('/market/a/b'))).status).toBe(404)
    })

    it('prefers static over parameter over wildcard, whatever the registration order', async () => {
      const r = await make()
      r.route('GET', '/x/*', echo('wild'))
      r.route('GET', '/x/:id', echo('param'))
      r.route('GET', '/x/fixed', echo('static'))
      expect(await body(await r.fetch(req('/x/fixed')))).toBe('static:{}')
      expect(await body(await r.fetch(req('/x/other')))).toBe('param:{"id":"other"}')
      expect(await body(await r.fetch(req('/x/other/deep')))).toBe('wild:{"*":"other/deep"}')
    })

    it('answers 404 for unknown paths and 405 with Allow for a known path with another method', async () => {
      const r = await make()
      r.route('GET', '/a', echo('a'))
      r.route('POST', '/a', echo('a-post'))
      expect((await r.fetch(req('/nope'))).status).toBe(404)
      const refused = await r.fetch(req('/a', 'DELETE'))
      expect(refused.status).toBe(405)
      expect(refused.headers.get('allow')).toBe('GET, HEAD, POST')
    })

    it('answers HEAD from the GET route with the same status and headers and no body, unless a HEAD route exists', async () => {
      const r = await make()
      r.route('GET', '/h', c => c.json({ big: 'body' }, 202))
      const head = await r.fetch(req('/h', 'HEAD'))
      expect(head.status).toBe(202)
      expect(head.headers.get('content-type')).toContain('application/json')
      expect(await body(head)).toBe('')
      r.route('HEAD', '/h', c => c.text('', 204))
      expect((await r.fetch(req('/h', 'HEAD'))).status).toBe(204)
    })

    it('lets a specific method beat the any-method route, and the any-method route catch the rest', async () => {
      const r = await make()
      r.route('*', '/m', echo('any'))
      r.route('GET', '/m', echo('get'))
      expect(await body(await r.fetch(req('/m')))).toBe('get:{}')
      expect(await body(await r.fetch(req('/m', 'PUT')))).toBe('any:{}')
    })

    it('throws on a duplicate route, including one that differs only in parameter name', async () => {
      const r = await make()
      r.route('GET', '/dup/:id', echo('one'))
      expect(() => r.route('GET', '/dup/:name', echo('two'))).toThrow(/duplicate/i)
      expect(() => r.route('POST', '/dup/:name', echo('post'))).not.toThrow()
    })

    it('rejects malformed paths', async () => {
      const r = await make()
      expect(() => r.route('GET', 'no-slash', echo('x'))).toThrow()
      expect(() => r.route('GET', '/a/*/b', echo('x'))).toThrow()
      expect(() => r.route('GET', '/a/:/b', echo('x'))).toThrow()
      expect(() => r.route('GET', '/a/:id/:id', echo('x'))).toThrow()
    })

    it('runs middleware in registration order around the handler and lets one short-circuit', async () => {
      const r = await make()
      const seen: string[] = []
      r.use('/api', async (c, next) => { seen.push('a-in'); c.set('who', 'alice'); const res = await next(); seen.push('a-out'); return res })
      r.use('/api', async (_c, next) => { seen.push('b-in'); const res = await next(); seen.push('b-out'); return res })
      r.use('/api/private', (c) => c.text('denied', 401))
      r.route('GET', '/api/ok', c => c.text(`hello ${c.get<string>('who') ?? '?'}`))
      r.route('GET', '/api/private/x', c => c.text('secret'))
      r.route('GET', '/open', c => c.text('open'))

      expect(await body(await r.fetch(req('/api/ok')))).toBe('hello alice')
      expect(seen).toEqual(['a-in', 'b-in', 'b-out', 'a-out'])
      seen.length = 0
      const denied = await r.fetch(req('/api/private/x'))
      expect(denied.status).toBe(401)
      // The /api middleware still ran before the /api/private one refused; /open is outside every middleware path.
      expect(seen).toEqual(['a-in', 'b-in', 'b-out', 'a-out'])
      seen.length = 0
      expect(await body(await r.fetch(req('/open')))).toBe('open')
      expect(seen).toEqual([])
    })

    it('turns a throwing handler into a 500 and a double next() into a 500', async () => {
      const r = await make()
      r.route('GET', '/boom', () => { throw new Error('boom') })
      r.use('/twice', async (_c, next) => { await next(); return next() })
      r.route('GET', '/twice', echo('t'))
      expect((await r.fetch(req('/boom'))).status).toBe(500)
      expect((await r.fetch(req('/twice'))).status).toBe(500)
    })

    it('removes a route when its remover runs, is idempotent, and leaves other routes alone', async () => {
      const r = await make()
      const removeA = r.route('GET', '/a', echo('a'))
      r.route('GET', '/b', echo('b'))
      expect((await r.fetch(req('/a'))).status).toBe(200)
      removeA()
      removeA()
      expect((await r.fetch(req('/a'))).status).toBe(404)
      expect((await r.fetch(req('/b'))).status).toBe(200)
      r.route('GET', '/a', echo('a2'))
      expect(await body(await r.fetch(req('/a')))).toBe('a2:{}')
    })

    it('removes middleware with its remover', async () => {
      const r = await make()
      r.route('GET', '/p', echo('p'))
      const remove = r.use('/', (c) => c.text('blocked', 403))
      expect((await r.fetch(req('/p'))).status).toBe(403)
      remove()
      expect((await r.fetch(req('/p'))).status).toBe(200)
    })

    it('returns to its baseline size after fifty register and remove cycles', async () => {
      const r = await make()
      r.route('GET', '/stay', echo('stay'))
      const baseline = r.size()
      for (let i = 0; i < 50; i += 1) {
        const a = r.route('GET', `/cycle/${String(i)}`, echo('c'))
        const b = r.use(`/cycle/${String(i)}`, async (_c, next) => next())
        expect(r.size()).toBe(baseline + 2)
        a()
        b()
      }
      expect(r.size()).toBe(baseline)
    })

    it('gives the same response through fetch as a handler builds, including headers and status', async () => {
      const r = await make()
      r.route('POST', '/echo/:name', async c => {
        const text = await c.req.text()
        return c.json({ name: c.params['name'], text, query: c.url.searchParams.get('q') }, 201)
      })
      const response = await r.fetch(new Request('http://acryl.test/echo/zed?q=1', { method: 'POST', body: 'hi' }))
      expect(response.status).toBe(201)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual({ name: 'zed', text: 'hi', query: '1' })
    })
  })
}
