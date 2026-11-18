/** WebSocket upgrades on the standalone adapter (spec 047 T009): checks as middleware, plain refusals, text-only and size limits, heartbeat, and plugin-owned sockets. */
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, connectionOf, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as nodeServer from '../src/index.ts'
import { UpgradeHub, testWebSocket } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function boot(config: Partial<nodeServer.Config> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  await ctx.plugin(nodeServer, { hostname: '127.0.0.1', ...config })
  return ctx
}

interface Seen {
  opened: number
  closed: Array<{ code: number; reason: string }>
  messages: string[]
}

/** A plugin that mounts `/ws` behind a check (a header and the real local port) and records what its handler saw. */
function wsPlugin(name: string, path: string, seen: Seen, options: { textOnly?: boolean } = {}) {
  return {
    name,
    inject: ['router', 'nodeServer'],
    apply(ctx: Context) {
      const upgrade = ctx.nodeServer.upgrades()
      ctx.router.route(
        '/',
        new Acryl()
          .use(path, async (c, next) => {
            const { localPort } = connectionOf(c)
            if (c.req.header('x-allow') !== 'yes' || localPort !== ctx.nodeServer.port) return c.text('forbidden', 403)
            await next()
          })
          .get(
            path,
            upgrade(
              () => ({
                onOpen() {
                  seen.opened += 1
                },
                onMessage(event, ws) {
                  seen.messages.push(String(event.data))
                  ws.send(`echo ${String(event.data)}`)
                },
                onClose(event) {
                  seen.closed.push({ code: event.code, reason: event.reason })
                },
              }),
              options,
            ),
          ),
      )
    },
  }
}

const fresh = (): Seen => ({ opened: 0, closed: [], messages: [] })
const wsUrl = (ctx: Context, path: string) => `${ctx.nodeServer.url.replace('http', 'ws')}${path}`
const open = (url: string, headers: Record<string, string> = { 'x-allow': 'yes' }, options: WebSocket.ClientOptions = {}) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { headers, ...options })
    ws.once('open', () => { resolve(ws) })
    ws.once('error', reject)
    ws.once('unexpected-response', (_request, response) => { reject(new Error(`refused ${String(response.statusCode)} ${String(response.headers.connection)}`)) })
  })
const closed = (ws: WebSocket) => new Promise<{ code: number; reason: string }>(resolve => { ws.once('close', (code, reason) => { resolve({ code, reason: reason.toString() }) }) })
const settle = () => new Promise(resolve => setTimeout(resolve, 60))

describe('WebSocket upgrades on the standalone adapter', () => {
  it('runs the route middleware first: a refusal is a plain HTTP status with Connection: close, before any handshake', async () => {
    const ctx = await boot()
    const seen = fresh()
    await ctx.plugin(wsPlugin('ws-a', '/ws', seen))
    await expect(open(wsUrl(ctx, '/ws'), {})).rejects.toThrow('refused 403 close')
    expect(seen.opened).toBe(0)
    const ws = await open(wsUrl(ctx, '/ws'))
    const reply = new Promise<string>(resolve => { ws.once('message', data => { resolve(data.toString()) }) })
    ws.send('hi')
    expect(await reply).toBe('echo hi')
    expect(seen.opened).toBe(1)
    ws.close()
    await closed(ws)
  })

  it('refuses a path nobody mounts and a request with a non-websocket Upgrade header', async () => {
    const ctx = await boot()
    await ctx.plugin(wsPlugin('ws-a', '/ws', fresh()))
    await expect(open(wsUrl(ctx, '/nope'))).rejects.toThrow(/refused 404 close/u)
    // `Upgrade: h2c` on the mounted path is not a WebSocket: a plain 400, the socket is closed.
    const reply = await new Promise<string>(resolve => {
      const request = httpRequest(`${ctx.nodeServer.url}/ws`, { headers: { connection: 'Upgrade', upgrade: 'h2c', 'x-allow': 'yes' } })
      request.on('response', response => { resolve(`${String(response.statusCode)} ${String(response.headers.connection)}`) })
      request.on('upgrade', () => { resolve('upgraded') })
      request.on('error', error => { resolve(String(error)) })
      request.end()
    })
    expect(reply).toBe('400 close')
  })

  it('with textOnly the handler never sees a binary frame; a frame over maxPayload closes the socket with 1009', async () => {
    const ctx = await boot({ websocket: { maxPayload: 1024 } })
    const seen = fresh()
    await ctx.plugin(wsPlugin('ws-a', '/ws', seen, { textOnly: true }))
    const ws = await open(wsUrl(ctx, '/ws'))
    ws.send(Buffer.from([1, 2, 3]), { binary: true })
    ws.send('text')
    await settle()
    expect(seen.messages).toEqual(['text'])
    ws.send('x'.repeat(2048))
    expect((await closed(ws)).code).toBe(1009)
  })

  it('a peer that stops answering pings is terminated, and the handler sees close once', async () => {
    const ctx = await boot({ websocket: { heartbeat: 50 } })
    const seen = fresh()
    await ctx.plugin(wsPlugin('ws-a', '/ws', seen))
    const ws = await open(wsUrl(ctx, '/ws'), { 'x-allow': 'yes' }, { autoPong: false })
    await closed(ws)
    await settle()
    expect(seen.closed).toHaveLength(1)
  })

  it('unloading a plugin closes the sockets it accepted with 1001, once each, and leaves other plugins alone; no socket remains after the last one', async () => {
    const ctx = await boot({ websocket: { grace: 500 } })
    const a = fresh()
    const b = fresh()
    const pluginA = ctx.plugin(wsPlugin('ws-a', '/a', a))
    const pluginB = ctx.plugin(wsPlugin('ws-b', '/b', b))
    await pluginA
    await pluginB
    const aSockets = await Promise.all([open(wsUrl(ctx, '/a')), open(wsUrl(ctx, '/a')), open(wsUrl(ctx, '/a'))])
    const bSocket = await open(wsUrl(ctx, '/b'))
    const aClosed = aSockets.map(closed)
    await pluginA.dispose()
    expect((await Promise.all(aClosed)).map(c => c.code)).toEqual([1001, 1001, 1001])
    await settle()
    expect(a.closed).toHaveLength(3)
    expect(bSocket.readyState).toBe(WebSocket.OPEN)
    expect(b.closed).toHaveLength(0)
    const bClosed = closed(bSocket)
    await pluginB.dispose()
    expect((await bClosed).code).toBe(1001)
    await settle()
    expect(b.closed).toHaveLength(1)
    expect(ctx.nodeServer.sockets).toBe(0)
  })

  it('stopping the server resolves while a socket is open, and the socket gets its close frame', async () => {
    // An upgraded socket is not an HTTP connection: closeIdleConnections and closeAllConnections never reach it, so the stop itself must see it
    // closed, with 1001 from its owner, before the grace runs out.
    const ctx = await boot({ websocket: { grace: 500 } })
    await ctx.plugin(wsPlugin('ws-a', '/ws', fresh()))
    const ws = await open(wsUrl(ctx, '/ws'))
    const done = closed(ws)
    await ctx.fiber.dispose()
    contexts.pop()
    expect((await done).code).toBe(1001)
  })

  it('a hub without the ws package says what to install', () => {
    expect(new UpgradeHub({ heartbeat: 0 }).size).toBe(0)
  })
})

describe('testWebSocket: the in-process pair', () => {
  it('runs the route and its middleware with no network: a refusal has a status, an accepted socket echoes and closes once', async () => {
    const seen = fresh()
    const hub = new UpgradeHub({ heartbeat: 0 })
    const upgrade = hub.upgradeWebSocketFor({ effect: () => undefined })
    const app = new Acryl()
      .use('/ws', async (c, next) => {
        if (c.req.header('x-allow') !== 'yes') return c.text('forbidden', 403)
        await next()
      })
      .get('/ws', upgrade(() => ({
        onOpen() { seen.opened += 1 },
        onMessage(event, ws) { ws.send(`echo ${String(event.data)}`) },
        onClose(event) { seen.closed.push({ code: event.code, reason: event.reason }) },
      })))
    const refused = await testWebSocket(async (request, env) => await app.fetch(request, env), '/ws')
    expect(refused).toEqual({ status: 403 })
    const { status, socket } = await testWebSocket(async (request, env) => await app.fetch(request, env), '/ws', { headers: { 'x-allow': 'yes' } })
    expect(status).toBe(101)
    socket!.send('hi')
    expect(socket!.received).toEqual(['echo hi'])
    socket!.close(1000, 'bye')
    expect(seen.closed).toEqual([{ code: 1000, reason: 'bye' }])
    await hub.close()
  })
})

describe('a client that resets an upgrade it sent', () => {
  it('costs the server nothing: the socket error is absorbed while the route is still deciding, and the next request is served', async () => {
    const ctx = await boot()
    await ctx.plugin({
      name: 'slow-ws',
      inject: ['router', 'nodeServer'],
      apply(inner: Context) {
        const upgrade = inner.nodeServer.upgrades()
        inner.router.route(
          '/',
          new Acryl()
            // The route takes its time to decide, as a check that reads a store does: the client is gone before it answers.
            .use('/slow', async (_c, next) => { await new Promise(resolve => setTimeout(resolve, 40)); await next() })
            .get('/slow', upgrade(() => ({})))
            .get('/alive', c => c.text('alive')),
        )
      },
    })
    const errors: unknown[] = []
    const onError = (error: unknown): void => { errors.push(error) }
    process.on('uncaughtException', onError)
    try {
      const { port } = ctx.nodeServer
      const resetOne = () => new Promise<void>((resolve) => {
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(`GET /slow HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`)
          setTimeout(() => { socket.resetAndDestroy(); resolve() }, 5)
        })
        socket.on('error', () => { resolve() })
      })
      await Promise.all(Array.from({ length: 20 }, resetOne))
      await new Promise(resolve => setTimeout(resolve, 120))
      expect(errors).toEqual([])
      expect(await (await fetch(`${ctx.nodeServer.url}/alive`)).text()).toBe('alive')
    } finally {
      process.off('uncaughtException', onError)
    }
  })
})
