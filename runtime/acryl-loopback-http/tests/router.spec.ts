import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Acryl } from 'acrylblends'
import { serve } from 'acrylblends/cordis/router-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, privateApi, readJson } from '../src/router.ts'

let server: Server | undefined

/** Serve `app` on a real loopback socket through the real HTTP adapter, so the guard sees the peer and the port a browser gives it. */
async function listen(app: Acryl): Promise<string> {
  server = createServer((req, res) => { void serve({ fetch: (request, connection) => Promise.resolve(app.fetch(request, { connection: connection ?? {} })) }, req, res) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server?.closeAllConnections()
    server?.close(() => { resolve() })
  })
  server = undefined
})

function routes(): Acryl {
  return new Acryl()
    .get('/api/a/read', ownPage, c => c.json({ ok: true }))
    .post('/api/a/write', ownPage, jsonContent, jsonBody(32), async (c) => {
      const body = await readJson(c)
      return body === INVALID_JSON ? c.json({ error: 'bad' }, 400) : c.json({ body })
    })
    .post('/_x/b/write', ownPage, c => c.json({ ok: true }))
    .get('/public', c => c.text('open'))
}

describe('privateApi', () => {
  it('serves the own page, with the private headers', async () => {
    const origin = await listen(privateApi(['/api/a', '/_x/b'], routes()))
    const read = await fetch(`${origin}/api/a/read`, { headers: { origin } })
    expect(read.status).toBe(200)
    expect(read.headers.get('cache-control')).toBe('no-store')
    expect(read.headers.get('x-content-type-options')).toBe('nosniff')
    const write = await fetch(`${origin}/_x/b/write`, { method: 'POST', headers: { origin } })
    expect(write.status).toBe(200)
    expect(write.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses another origin and a request without one, and the refusal is private too', async () => {
    const origin = await listen(privateApi('/api/a', routes()))
    const other = await fetch(`${origin}/api/a/write`, { method: 'POST', headers: { origin: 'http://127.0.0.1:1' } })
    expect(other.status).toBe(403)
    expect(other.headers.get('cache-control')).toBe('no-store')
    expect((await fetch(`${origin}/api/a/write`, { method: 'POST' })).status).toBe(403)
  })

  it('answers a known path asked with another method 405 with its Allow, on every prefix', async () => {
    const origin = await listen(privateApi(['/api/a', '/_x/b'], routes()))
    const wrong = await fetch(`${origin}/api/a/read`, { method: 'DELETE', headers: { origin } })
    expect(wrong.status).toBe(405)
    expect(wrong.headers.get('allow')).toContain('GET')
    expect(await wrong.json()).toEqual({ error: 'method not allowed' })
    const second = await fetch(`${origin}/_x/b/write`, { headers: { origin } })
    expect(second.status).toBe(405)
    expect(second.headers.get('allow')).toBe('POST')
  })

  it('leaves a route outside its prefixes alone', async () => {
    const origin = await listen(privateApi('/api/a', routes()))
    const open = await fetch(`${origin}/public`)
    expect(open.status).toBe(200)
    expect(open.headers.get('cache-control')).toBeNull()
  })

  it('refuses a body over the limit with 413 and reads bad JSON as INVALID_JSON', async () => {
    const origin = await listen(privateApi('/api/a', routes()))
    const post = (body: string): Promise<Response> => fetch(`${origin}/api/a/write`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body })
    const large = await post(JSON.stringify({ text: 'x'.repeat(64) }))
    expect(large.status).toBe(413)
    expect(await large.json()).toEqual({ error: 'request body is too large' })
    expect((await post('{')).status).toBe(400)
    expect(await (await post('{"a":1}')).json()).toEqual({ body: { a: 1 } })
  })

  it('refuses a change that does not declare a JSON body with 415, and takes the media type with parameters', async () => {
    const origin = await listen(privateApi('/api/a', routes()))
    const post = (type: string | undefined): Promise<Response> =>
      fetch(`${origin}/api/a/write`, { method: 'POST', headers: { origin, ...(type === undefined ? {} : { 'content-type': type }) }, body: '{"a":1}' })
    const plain = await post('text/plain')
    expect(plain.status).toBe(415)
    expect(await plain.json()).toEqual({ error: 'content type must be application/json' })
    expect((await post(undefined)).status).toBe(415)
    expect((await post('Application/JSON; charset=utf-8')).status).toBe(200)
  })
})
