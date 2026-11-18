/** Raw node handlers beside the router: exact and prefix paths, the longest prefix, duplicates, disposal, errors, and a claimed upgrade. */
import { connect } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, name as routerName, type RouterEnv } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import * as nodeServer from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function boot(config: Partial<nodeServer.Config> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  const fiber = ctx.plugin(nodeServer, { port: 0, scan: 0, ...config })
  await fiber
  if (ctx.get('nodeServer') === undefined)
    throw new Error(`acryl-node-server did not provide nodeServer (fiber state ${String(fiber.state)})`)
  return ctx
}

describe('raw node routes', () => {
  it('serves an exact path and a prefix, and the router serves everything else', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    server.registerRaw({
      kind: 'exact',
      path: '/raw/exact',
      handler: (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`exact ${String(req.method)}`) },
    })
    server.registerRaw({
      kind: 'prefix',
      path: '/raw/prefix',
      handler: (_req, res) => { res.writeHead(200); res.end('prefix') },
    })
    ctx.router.route('/', new Acryl().get('/router', c => c.text('router')))

    expect(await (await fetch(`${server.url}/raw/exact`)).text()).toBe('exact GET')
    expect(await (await fetch(`${server.url}/raw/prefix`)).text()).toBe('prefix')
    expect(await (await fetch(`${server.url}/raw/prefix/below?x=1`)).text()).toBe('prefix')
    expect(await (await fetch(`${server.url}/router`)).text()).toBe('router')
    expect((await fetch(`${server.url}/raw/exact/below`)).status).toBe(404)
    expect((await fetch(`${server.url}/raw/prefixes`)).status).toBe(404)
  })

  it('prefers the longest prefix when two overlap', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    server.registerRaw({ kind: 'prefix', path: '/api', handler: (_req, res) => { res.end('short') } })
    server.registerRaw({ kind: 'prefix', path: '/api/deeper', handler: (_req, res) => { res.end('long') } })
    expect(await (await fetch(`${server.url}/api/x`)).text()).toBe('short')
    expect(await (await fetch(`${server.url}/api/deeper/x`)).text()).toBe('long')
  })

  it('refuses a duplicate path, and its remover gives the path back', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    const remove = server.registerRaw({ kind: 'exact', path: '/one', handler: (_req, res) => { res.end('one') } })
    expect(() => server.registerRaw({ kind: 'exact', path: '/one', handler: (_req, res) => { res.end('two') } })).toThrow(/already served/u)
    expect(await (await fetch(`${server.url}/one`)).text()).toBe('one')
    remove()
    expect((await fetch(`${server.url}/one`)).status).toBe(404)
  })

  it('keeps one raw upgrade listener across claims added, removed and added again', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    const before = server.upgradeListenerCount
    expect(before).toBe(1)
    const first = server.registerRawUpgrade({ path: '/raw/socket', handler: (_req, socket) => { socket.destroy() } })
    expect(server.upgradeListenerCount).toBe(before)
    first()
    expect(server.upgradeListenerCount).toBe(before)
    const second = server.registerRawUpgrade({ path: '/raw/socket', handler: (_req, socket) => { socket.destroy() } })
    expect(server.upgradeListenerCount).toBe(before)
    second()
    expect(server.upgradeListenerCount).toBe(before)
  })

  it('answers 500 when a handler throws, without leaking the error', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    server.registerRaw({ kind: 'exact', path: '/boom', handler: () => { throw new Error('secret detail') } })
    const response = await fetch(`${server.url}/boom`)
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('internal error')
  })

  it('refuses an unclaimed upgrade cleanly (503 and close) instead of letting it reach the HTTP routes', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    // No hub and no raw claim: nobody owns this upgrade. The transport refuses it; the HTTP fetch path never writes a second answer.
    const answer = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(server.url).port), '127.0.0.1', () => {
        client.write('GET /nothing HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n')
      })
      let data = ''
      client.on('data', (chunk) => { data += chunk.toString() })
      client.once('error', reject)
      client.once('close', () => { resolve(data) })
      setTimeout(() => { client.destroy(); resolve(data) }, 3_000)
    })
    expect(answer).toContain('503 Service Unavailable')
    expect(answer).toMatch(/connection: close/iu)
  })

  it('hands a claimed upgrade to the raw handler and never to the router', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    let upgraded = ''
    let routerUpgrade = false
    ctx.router.route('/', new Acryl().get('/ws', (c) => {
      routerUpgrade = true
      return c.text('router upgrade')
    }))
    // Attach the router's WebSocket setup too, so the claimed upgrade exercises the adapter's skip path, not only the missing-listener case.
    server.upgrades()
    server.registerRawUpgrade({
      path: '/raw/socket',
      handler: (req, socket) => { upgraded = req.url ?? ''; socket.destroy() },
    })
    await new Promise<void>((resolve, reject) => {
      const client = connect(Number(new URL(server.url).port), '127.0.0.1', () => {
        client.write('GET /raw/socket HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n')
      })
      client.once('error', reject)
      client.once('close', () => { resolve() })
      setTimeout(() => { client.destroy(); resolve() }, 5_000)
    })
    expect(upgraded).toBe('/raw/socket')
    expect(routerUpgrade).toBe(false)
  })
})

describe('a request gate', () => {
  it('answers before raw routes and the router, passes the rest on, and goes when its remover runs', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    server.registerRaw({ kind: 'exact', path: '/', handler: (_req, res) => { res.end('page') } })
    ctx.router.route('/', new Acryl().get('/router', c => c.text('router')))
    const remove = server.gate(request => request.headers.get('x-gate') === 'yes'
      ? new Response(null, { status: 307, headers: { location: '/app/x' } })
      : undefined)
    const answered = await fetch(`${server.url}/`, { headers: { 'x-gate': 'yes' }, redirect: 'manual' })
    expect(answered.status).toBe(307)
    expect(answered.headers.get('location')).toBe('/app/x')
    expect(await (await fetch(`${server.url}/`)).text()).toBe('page')
    expect(await (await fetch(`${server.url}/router`)).text()).toBe('router')
    remove()
    expect(await (await fetch(`${server.url}/`, { headers: { 'x-gate': 'yes' } })).text()).toBe('page')
  })

  it('may answer through the router ahead of a raw prefix, carrying the socket facts', async () => {
    const ctx = await boot()
    const server = ctx.nodeServer
    server.registerRaw({ kind: 'prefix', path: '/api', handler: (_req, res) => { res.end('raw api') } })
    ctx.router.route('/api', new Acryl<RouterEnv>().get('/who', c => c.json(c.env.connection)))
    const remove = server.gate((request, connection) =>
      new URL(request.url).pathname === '/api/who' ? server.throughRouter(request, connection) : undefined)
    const answer = await fetch(`${server.url}/api/who`)
    const body = await answer.text()
    expect(answer.status, body).toBe(200)
    const facts = JSON.parse(body) as { remoteAddress?: string; localPort?: number }
    expect(facts.remoteAddress).toBeDefined()
    expect(facts.localPort).toBe(Number(new URL(server.url).port))
    // A path the gate passes on still goes to the raw prefix.
    expect(await (await fetch(`${server.url}/api/other`)).text()).toBe('raw api')
    remove()
  })
})
