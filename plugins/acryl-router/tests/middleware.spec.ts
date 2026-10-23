/** The built-in middleware (spec 046), each through the real Cordis service and `router.request`. */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, name, type Router } from '../src/index.ts'
import { bodyLimit, cors, logger, loopbackOnly, requestId, secureHeaders } from '../src/middleware/index.ts'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function mount(): Promise<Router> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply })
  await settle()
  return ctx.router
}

describe('secureHeaders', () => {
  it('adds the hardening headers without overriding what the handler set, and lets a default be removed', async () => {
    const router = await mount()
    router.use(secureHeaders({ headers: { 'x-frame-options': '' } }))
    router.get('/a', c => c.text('a'))
    router.get('/b', () => new Response('b', { headers: { 'referrer-policy': 'origin' } }))
    const a = await router.request('/a')
    expect(a.headers.get('x-content-type-options')).toBe('nosniff')
    expect(a.headers.get('x-frame-options')).toBeNull()
    expect((await router.request('/b')).headers.get('referrer-policy')).toBe('origin')
  })

  it('also works on an immutable response', async () => {
    const router = await mount()
    router.use(secureHeaders())
    router.get('/go', () => Response.redirect('http://example.test/x', 302))
    const response = await router.request('/go')
    expect(response.status).toBe(302)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('requestId', () => {
  it('keeps a well-formed incoming id, replaces a bad one, and exposes it to handlers', async () => {
    const router = await mount()
    router.use(requestId({ generate: () => 'generated-1' }))
    router.get('/id', c => c.text(c.get<string>('requestId') ?? ''))
    const kept = await router.request('/id', { headers: { 'x-request-id': 'abc-123' } })
    expect(await kept.text()).toBe('abc-123')
    expect(kept.headers.get('x-request-id')).toBe('abc-123')
    const replaced = await router.request('/id', { headers: { 'x-request-id': 'bad id with spaces' } })
    expect(await replaced.text()).toBe('generated-1')
    expect((await router.request('/id')).headers.get('x-request-id')).toBe('generated-1')
  })
})

describe('logger', () => {
  it('writes an in line and an out line with status and time to the sink, and reports a throw', async () => {
    const router = await mount()
    const lines: string[] = []
    router.use(logger(line => lines.push(line)))
    router.get('/ok', c => c.text('ok'))
    router.get('/boom', () => { throw new Error('boom') })
    await router.request('/ok')
    await router.request('/boom')
    expect(lines[0]).toBe('<-- GET /ok')
    expect(lines[1]).toMatch(/^--> GET \/ok 200 \d+ms$/)
    expect(lines[2]).toBe('<-- GET /boom')
    expect(lines[3]).toMatch(/^--> GET \/boom threw boom \d+ms$/)
  })
})

describe('bodyLimit', () => {
  it('refuses a declared length over the limit and lets a smaller one through', async () => {
    const router = await mount()
    router.use(bodyLimit({ maxBytes: 10 }))
    router.post('/in', async c => c.text(await c.req.text()))
    const big = await router.request('/in', { method: 'POST', body: 'x'.repeat(50), headers: { 'content-length': '50' } })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'payload too large', maxBytes: 10 })
    expect(await (await router.request('/in', { method: 'POST', body: 'small', headers: { 'content-length': '5' } })).text()).toBe('small')
  })

  it('uses a custom error response', async () => {
    const router = await mount()
    router.use(bodyLimit({ maxBytes: 1, onError: c => c.text('too big', 400) }))
    router.post('/in', c => c.text('ok'))
    const response = await router.request('/in', { method: 'POST', body: 'xx', headers: { 'content-length': '2' } })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('too big')
  })
})

describe('cors', () => {
  it('answers a preflight itself and adds the headers to normal responses', async () => {
    const router = await mount()
    router.use(cors({ origin: ['https://app.example'], allowMethods: ['GET', 'POST'], maxAge: 600, credentials: true }))
    router.get('/x', c => c.text('x'))
    const preflight = await router.request('/x', { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-a, x-b' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET,POST')
    expect(preflight.headers.get('access-control-allow-headers')).toBe('x-a,x-b')
    expect(preflight.headers.get('access-control-max-age')).toBe('600')
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    const normal = await router.request('/x', { headers: { origin: 'https://app.example' } })
    expect(normal.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(normal.headers.get('vary')).toContain('Origin')
  })

  it('does not allow an origin outside the list', async () => {
    const router = await mount()
    router.use(cors({ origin: 'https://app.example' }))
    router.get('/x', c => c.text('x'))
    const response = await router.request('/x', { headers: { origin: 'https://evil.example' } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('loopbackOnly', () => {
  const peer = { remoteAddress: '127.0.0.1', localPort: 3105 }
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({ host: '127.0.0.1:3105', ...extra })

  it('lets a loopback peer on the real port through and refuses everything else with a 403', async () => {
    const router = await mount()
    router.use(loopbackOnly())
    router.get('/x', c => c.text('x'))
    expect((await router.request('/x', { headers: headers() }, peer)).status).toBe(200)
    expect((await router.request('/x', { headers: headers() }, { remoteAddress: '203.0.113.9', localPort: 3105 })).status).toBe(403)
    expect((await router.request('/x', { headers: headers({ host: '127.0.0.1:9999' }) }, peer)).status).toBe(403)
    expect((await router.request('/x', { headers: headers({ host: 'evil.example:3105' }) }, peer)).status).toBe(403)
    expect((await router.request('/x', { headers: headers({ 'sec-fetch-site': 'cross-site' }) }, peer)).status).toBe(403)
    expect((await router.request('/x', { headers: headers() })).status).toBe(403)
  })

  it('accepts an IPv4-mapped loopback address and ::1', async () => {
    const router = await mount()
    router.use(loopbackOnly())
    router.get('/x', c => c.text('x'))
    expect((await router.request('/x', { headers: headers() }, { remoteAddress: '::ffff:127.0.0.1', localPort: 3105 })).status).toBe(200)
    expect((await router.request('/x', { headers: headers() }, { remoteAddress: '::1', localPort: 3105 })).status).toBe(200)
  })

  it('requires a same-origin Origin for a change, and none for a read', async () => {
    const router = await mount()
    router.use(loopbackOnly())
    router.post('/do', c => c.text('done'))
    expect((await router.request('/do', { method: 'POST', headers: headers() }, peer)).status).toBe(403)
    expect((await router.request('/do', { method: 'POST', headers: headers({ origin: 'http://evil.example' }) }, peer)).status).toBe(403)
    expect((await router.request('/do', { method: 'POST', headers: headers({ origin: 'http://127.0.0.1:3105' }) }, peer)).status).toBe(200)
  })

  it('can check only the peer when mutations are none', async () => {
    const router = await mount()
    router.use(loopbackOnly({ mutations: 'none' }))
    router.post('/do', c => c.text('done'))
    expect((await router.request('/do', { method: 'POST', headers: headers() }, peer)).status).toBe(200)
  })
})
