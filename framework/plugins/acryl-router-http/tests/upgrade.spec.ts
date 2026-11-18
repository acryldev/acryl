/** WebSocket upgrades through the Host's web server (spec 047 T009): exact-path claims inside a mounted prefix, checks as middleware, and sockets owned by the mounting plugin. */
import { request as httpRequest } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { Acryl, apply as routerApply, connectionOf, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { apply as httpApply, inject as httpInject, name as httpName } from '../src/index.ts'

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await settle(10) }
  throw new Error(`timed out waiting for: ${label}`)
}

async function web(): Promise<{ ctx: Context, port: number }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
  ctx.plugin({ name: routerName, apply: routerApply })
  ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
  const probe = ctx as unknown as { webServer?: { port: number }, routerHttp?: unknown }
  await until(() => probe.webServer?.port !== undefined && probe.routerHttp !== undefined, 'the web composition')
  return { ctx, port: probe.webServer!.port }
}

interface Seen { opened: number, closed: number[], messages: string[] }
const fresh = (): Seen => ({ opened: 0, closed: [], messages: [] })

/** A plugin that mounts `prefix` with one upgrade path behind a check (a header, and the real local port) and records what its handler saw. */
function terminal(name: string, prefix: string, seen: Seen, port: () => number) {
  return {
    name,
    inject: ['router', 'routerHttp'],
    apply(ctx: Context) {
      const upgrade = ctx.routerHttp.upgrades()
      ctx.router.route(prefix, new Acryl()
        .use('/stream', async (c, next) => {
          if (c.req.header('x-allow') !== 'yes' || connectionOf(c).localPort !== port()) return c.text('forbidden', 403)
          await next()
        })
        .get('/stream', upgrade(() => ({
          onOpen() { seen.opened += 1 },
          onMessage(event, ws) { seen.messages.push(String(event.data)); ws.send(`echo ${String(event.data)}`) },
          onClose(event) { seen.closed.push(event.code) },
        })))
        .get('/plain', c => c.json({ ok: true })))
      ctx.routerHttp.mount(prefix, { upgrade: [`${prefix}/stream`] })
    },
  }
}

const open = (port: number, path: string, headers: Record<string, string> = { 'x-allow': 'yes' }) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}${path}`, { headers })
    ws.once('open', () => { resolve(ws) })
    ws.once('error', reject)
    ws.once('unexpected-response', (_request, response) => { reject(new Error(`refused ${String(response.statusCode)} ${String(response.headers.connection)}`)) })
  })
const closed = (ws: WebSocket) => new Promise<number>(resolve => { ws.once('close', code => { resolve(code) }) })

describe('WebSocket upgrades through the Host web server', () => {
  it('runs the route middleware first, refuses with a plain status, and echoes once accepted', async () => {
    const { ctx, port } = await web()
    const seen = fresh()
    ctx.plugin(terminal('term', '/api/term', seen, () => port))
    await settle(60)
    await expect(open(port, '/api/term/stream', {})).rejects.toThrow('refused 403 close')
    expect(seen.opened).toBe(0)
    const ws = await open(port, '/api/term/stream')
    const reply = new Promise<string>(resolve => { ws.once('message', data => { resolve(data.toString()) }) })
    ws.send('hi')
    expect(await reply).toBe('echo hi')
    ws.close()
    await closed(ws)
    await settle(40)
    expect(seen.closed).toHaveLength(1)
    // The plain HTTP route of the same mount still answers.
    expect(await (await fetch(`http://127.0.0.1:${String(port)}/api/term/plain`)).json()).toEqual({ ok: true })
  })

  it('accepts an upgrade only on the paths the mount listed', async () => {
    const { ctx, port } = await web()
    ctx.plugin(terminal('term', '/api/term', fresh(), () => port))
    await settle(60)
    // `/api/term/plain` is mounted for HTTP but was not listed for upgrades: the web server drops the socket.
    await expect(open(port, '/api/term/plain')).rejects.toThrow()
    await expect(open(port, '/api/elsewhere')).rejects.toThrow()
  })

  it('refuses an upgrade path outside the prefix, and a duplicate claim leaves nothing mounted', async () => {
    const { ctx } = await web()
    const service = (ctx as unknown as { routerHttp: { mount(prefix: string, options?: { upgrade?: string[] }): () => void } }).routerHttp
    expect(() => service.mount('/api/a', { upgrade: ['/api/b/stream'] })).toThrow(/not inside the prefix/u)
    const remove = service.mount('/api/a', { upgrade: ['/api/a/stream'] })
    expect(() => service.mount('/api/a', { upgrade: ['/api/a/stream'] })).toThrow(/duplicate upgrade route/u)
    // The refused call mounted nothing: after removing the first claim the same mount works again.
    remove()
    const again = service.mount('/api/a', { upgrade: ['/api/a/stream'] })
    again()
  })

  it('unloading the plugin closes its sockets with 1001, once each, and leaves another plugin alone', async () => {
    const { ctx, port } = await web()
    const a = fresh()
    const b = fresh()
    const pluginA = ctx.plugin(terminal('term-a', '/api/a', a, () => port))
    const pluginB = ctx.plugin(terminal('term-b', '/api/b', b, () => port))
    await settle(80)
    const aSockets = await Promise.all([open(port, '/api/a/stream'), open(port, '/api/a/stream')])
    const bSocket = await open(port, '/api/b/stream')
    const aClosed = aSockets.map(closed)
    await pluginA.dispose()
    expect(await Promise.all(aClosed)).toEqual([1001, 1001])
    await settle(60)
    expect(a.closed).toEqual([1001, 1001])
    expect(bSocket.readyState).toBe(WebSocket.OPEN)
    // The unmounted path is gone: no upgrade is accepted on it any more.
    await expect(open(port, '/api/a/stream')).rejects.toThrow()
    const bClosed = closed(bSocket)
    await pluginB.dispose()
    expect(await bClosed).toBe(1001)
    await settle(60)
    expect(b.closed).toEqual([1001])
    // No socket of either plugin remains.
    expect(ctx.routerHttp.sockets).toBe(0)
  })

  it('a request with a different Upgrade header gets a plain 400', async () => {
    const { ctx, port } = await web()
    ctx.plugin(terminal('term', '/api/term', fresh(), () => port))
    await settle(60)
    const reply = await new Promise<string>(resolve => {
      const request = httpRequest(`http://127.0.0.1:${String(port)}/api/term/stream`, { headers: { connection: 'Upgrade', upgrade: 'h2c', 'x-allow': 'yes' } })
      request.on('response', response => { resolve(`${String(response.statusCode)} ${String(response.headers.connection)}`) })
      request.on('upgrade', () => { resolve('upgraded') })
      request.on('error', error => { resolve(String(error)) })
      request.end()
    })
    expect(reply).toBe('400 close')
  })
})
