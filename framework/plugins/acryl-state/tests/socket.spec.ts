/**
 * State over a WebSocket, on a real server: one socket carries many keys, the value comes now and after every change, a refused upgrade is a plain 403 (another page's Origin, a name that
 * only resolves here), and the client module is served. The browser client is tested in client.spec.ts and, in real Chrome, by the repository's gate.
 */

import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as nodeServer from 'acryl-node-server'
import { apply, name } from '../src/index.ts'
import { stateSocket } from '../src/socket.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function boot(): Promise<{ ctx: Context, origin: string }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  await ctx.plugin({ name, apply })
  await ctx.plugin(nodeServer, { hostname: '127.0.0.1', port: 0 })
  return { ctx, origin: (ctx as unknown as { nodeServer: { url: string } }).nodeServer.url.replace(/\/$/u, '') }
}

const wsUrl = (origin: string): string => `${origin.replace('http', 'ws')}/api/state/ws`

/** What the upgrade answered: `opened`, or `refused <status>`. */
function attempt(url: string, headers: Record<string, string>): Promise<{ answer: string, socket?: WebSocket }> {
  return new Promise(resolve => {
    const socket = new WebSocket(url, { headers })
    socket.once('open', () => { resolve({ answer: 'opened', socket }) })
    socket.once('unexpected-response', (_request, response) => { resolve({ answer: `refused ${String(response.statusCode)}` }) })
    socket.once('error', () => { resolve({ answer: 'error' }) })
  })
}

async function open(origin: string, headers: Record<string, string> = { origin }): Promise<WebSocket> {
  const { answer, socket } = await attempt(wsUrl(origin), headers)
  if (socket === undefined) throw new Error(`the upgrade was not accepted: ${answer}`)
  return socket
}

/** The next `count` JSON frames of a socket, skipping heartbeat pings. */
function frames(socket: WebSocket, count: number): Promise<object[]> {
  return new Promise(resolve => {
    const seen: object[] = []
    const onMessage = (data: WebSocket.RawData): void => {
      const frame = JSON.parse(String(data)) as { t?: string }
      if (frame.t === 'ping') return
      seen.push(frame)
      if (seen.length === count) {
        socket.off('message', onMessage)
        resolve(seen)
      }
    }
    socket.on('message', onMessage)
  })
}

const settle = (ms = 20): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('state over a WebSocket', () => {
  it('follows several keys on one socket: the value now, then every change, in order', async () => {
    const { ctx, origin } = await boot()
    const count = ctx.state.cell<number>('app.count', 0)
    const title = ctx.state.cell<string>('app.title', 'a')
    const socket = await open(origin)
    const seen = frames(socket, 5)
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    socket.send(JSON.stringify({ t: 'sub', key: 'app.title' }))
    await settle()
    count.set(1)
    count.set(2)
    title.set('12')
    expect(await seen).toEqual([
      { key: 'app.count', value: 0 },
      { key: 'app.title', value: 'a' },
      { key: 'app.count', value: 1 },
      { key: 'app.count', value: 2 },
      { key: 'app.title', value: '12' },
    ])
    socket.close()
  })

  it('sends objects as they are and undefined as null', async () => {
    const { ctx, origin } = await boot()
    ctx.state.cell('app.board', { cards: [1, 2], open: true })
    ctx.state.cell<string | undefined>('app.none', undefined)
    const socket = await open(origin)
    const seen = frames(socket, 2)
    socket.send(JSON.stringify({ t: 'sub', key: 'app.board' }))
    socket.send(JSON.stringify({ t: 'sub', key: 'app.none' }))
    expect(await seen).toEqual([{ key: 'app.board', value: { cards: [1, 2], open: true } }, { key: 'app.none', value: null }])
    socket.close()
  })

  it('answers a key that does not exist with an error frame and keeps the socket', async () => {
    const { ctx, origin } = await boot()
    ctx.state.cell<number>('app.count', 7)
    const socket = await open(origin)
    const seen = frames(socket, 2)
    socket.send(JSON.stringify({ t: 'sub', key: 'app.missing' }))
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    expect(await seen).toEqual([{ key: 'app.missing', error: 'no such state' }, { key: 'app.count', value: 7 }])
    socket.close()
  })

  it('stops sending a key after unsub, and answers a key asked twice with its value, followed once', async () => {
    const { ctx, origin } = await boot()
    const count = ctx.state.cell<number>('app.count', 0)
    const socket = await open(origin)
    const seen: object[] = []
    socket.on('message', data => { const frame = JSON.parse(String(data)) as { t?: string }; if (frame.t !== 'ping') seen.push(frame) })
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    await settle()
    count.set(1)
    await settle()
    expect(seen).toEqual([{ key: 'app.count', value: 0 }, { key: 'app.count', value: 0 }, { key: 'app.count', value: 1 }])
    socket.send(JSON.stringify({ t: 'unsub', key: 'app.count' }))
    await settle()
    count.set(2)
    await settle()
    expect(seen).toHaveLength(3)
    socket.close()
  })

  it('drops its subscriptions when the socket closes', async () => {
    const { ctx, origin } = await boot()
    const count = ctx.state.cell<number>('app.count', 0)
    const socket = await open(origin)
    const first = frames(socket, 1)
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    await first
    socket.close()
    await new Promise(resolve => socket.once('close', resolve))
    await settle()
    let listeners = 0
    const probe = count.subscribe(() => { listeners += 1 })
    count.set(1)
    probe()
    expect(listeners).toBe(1)
    expect((ctx as unknown as { nodeServer: { sockets: number } }).nodeServer.sockets).toBe(0)
  })

  it('ignores frames it does not understand', async () => {
    const { ctx, origin } = await boot()
    ctx.state.cell<number>('app.count', 3)
    const socket = await open(origin)
    const seen = frames(socket, 1)
    socket.send('not json')
    socket.send(JSON.stringify({ t: 'sub' }))
    socket.send(JSON.stringify({ t: 'sub', key: 5 }))
    socket.send(JSON.stringify({ t: 'what', key: 'app.count' }))
    socket.send(JSON.stringify({ t: 'sub', key: 'app.count' }))
    expect(await seen).toEqual([{ key: 'app.count', value: 3 }])
    socket.close()
  })

  it('writes a ping on its heartbeat, so a page can tell a quiet socket from a dead one', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin({ name: routerName, apply: routerApply })
    await ctx.plugin({ name, apply })
    await ctx.plugin(nodeServer, { hostname: '127.0.0.1', port: 0 })
    // The module's default is 15 s; a route of its own with a short one shows the frame.
    await ctx.plugin({
      name: 'quick-heartbeat',
      inject: ['router', 'nodeServer', 'state'],
      apply(inner: Context) {
        inner.router.route('/', new Acryl().get('/beat', stateSocket(inner.state, { upgrade: inner.nodeServer.upgrades(), heartbeatMs: 25 })))
      },
    })
    const origin = (ctx as unknown as { nodeServer: { url: string } }).nodeServer.url.replace(/\/$/u, '')
    const socket = new WebSocket(`${origin.replace('http', 'ws')}/beat`, { headers: { origin } })
    const first = await new Promise<string>((resolve, reject) => { socket.once('message', data => { resolve(String(data)) }); socket.once('error', reject) })
    expect(JSON.parse(first)).toEqual({ t: 'ping' })
    socket.close()
  })

  describe('who may open it', () => {
    it('lets this app\'s own page in, and a program on this machine that sends no Origin', async () => {
      const { origin } = await boot()
      const own = await attempt(wsUrl(origin), { origin })
      expect(own.answer).toBe('opened')
      own.socket?.close()
      const script = await attempt(wsUrl(origin), {})
      expect(script.answer).toBe('opened')
      script.socket?.close()
    })

    it('refuses a page of another origin, with 403', async () => {
      const { origin } = await boot()
      expect((await attempt(wsUrl(origin), { origin: 'http://evil.example' })).answer).toBe('refused 403')
      expect((await attempt(wsUrl(origin), { origin: 'http://127.0.0.1:1' })).answer).toBe('refused 403')
      expect((await attempt(wsUrl(origin), { origin: 'null' })).answer).toBe('refused 403')
    })

    it('refuses a cross-site browser request even with the right Origin', async () => {
      const { origin } = await boot()
      expect((await attempt(wsUrl(origin), { origin, 'sec-fetch-site': 'same-site' })).answer).toBe('refused 403')
      expect((await attempt(wsUrl(origin), { origin, 'sec-fetch-site': 'cross-site' })).answer).toBe('refused 403')
    })

    it('refuses a name that only resolves to this machine (DNS rebinding), with or without an Origin', async () => {
      const { origin } = await boot()
      const port = new URL(origin).port
      expect((await attempt(wsUrl(origin), { host: `evil.example:${port}` })).answer).toBe('refused 403')
      expect((await attempt(wsUrl(origin), { host: `evil.example:${port}`, origin: `http://evil.example:${port}` })).answer).toBe('refused 403')
      expect((await attempt(wsUrl(origin), { host: 'evil.example' })).answer).toBe('refused 403')
    })
  })

  it('serves the client module, and keeps `ws` and `client.js` from being keys', async () => {
    const { ctx, origin } = await boot()
    const response = await fetch(`${origin}/api/state/client.js`, { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toContain('export function watch(')
    expect(() => ctx.state.cell('ws', 1)).toThrow(/route under \/api\/state/)
    expect(() => ctx.state.cell('client.js', 1)).toThrow(/route under \/api\/state/)
  })

  it('closes its sockets, with 1001, when the plugin unloads', async () => {
    const { ctx, origin } = await boot()
    ctx.state.cell<number>('app.count', 0)
    const socket = await open(origin)
    const closed = new Promise<number>(resolve => socket.once('close', code => { resolve(code) }))
    const stateFiber = [...ctx.registry.values()].find(runtime => runtime.name === name)!.fibers[Symbol.iterator]().next().value!
    await stateFiber.dispose()
    expect(await closed).toBe(1001)
  })

  it('answers 404 on /ws where no server upgrades, and the event stream carries JSON with ?json=1', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin({ name: routerName, apply: routerApply })
    await ctx.plugin({ name, apply })
    ctx.state.cell<string>('app.title', '12')
    expect((await ctx.router.fetch(new Request('http://127.0.0.1/api/state/ws'))).status).toBe(404)
    const read = async (path: string): Promise<string> => {
      const controller = new AbortController()
      const stream = await ctx.router.fetch(new Request(`http://127.0.0.1/api/state/${path}`, { signal: controller.signal }))
      const reader = stream.body!.getReader()
      const text = new TextDecoder().decode((await reader.read()).value)
      controller.abort()
      return text
    }
    expect(await read('app.title/events')).toBe('event: value\ndata: 12\n\n')
    expect(await read('app.title/events?json=1')).toBe('event: value\ndata: "12"\n\n')
  })
})
