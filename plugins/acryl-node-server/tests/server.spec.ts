/** The standalone adapter over real sockets: serving, connection facts, port scan, streams, disposal, reload. */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, connectionOf, name as routerName } from 'acryl-router'
import { streamSSE } from 'acryl-router/helpers'
import { afterEach, describe, expect, it } from 'vitest'
import * as nodeServer from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

/** A context with the router active: the adapter injects it, and until it is provided the adapter's fiber is PENDING with nothing to await. */
async function routed(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  return ctx
}

/**
 * A router and the adapter, returned once the adapter's fiber has settled: the service exists only after the server listens, which a port
 * scan delays (a fixed wait raced it on a slow Windows runner).
 * @throws naming the fiber state, when the adapter did not provide its service.
 */
async function boot(config: Partial<nodeServer.Config> = {}): Promise<Context> {
  const ctx = await routed()
  const fiber = ctx.plugin(nodeServer, config)
  await fiber
  if (ctx.get('nodeServer') === undefined) throw new Error(`acryl-node-server did not provide nodeServer (fiber state ${String(fiber.state)}, config ${JSON.stringify(config)})`)
  return ctx
}

/** Hold a port so a server asked for it has to scan. */
async function occupy(): Promise<{ port: number, release: () => Promise<void> }> {
  const blocker = createServer()
  await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve))
  return { port: (blocker.address() as AddressInfo).port, release: () => new Promise<void>(resolve => blocker.close(() => { resolve() })) }
}

const portIsFree = async (port: number): Promise<boolean> => {
  const probe = createServer()
  return new Promise<boolean>(resolve => {
    probe.once('error', () => { resolve(false) })
    probe.listen(port, '127.0.0.1', () => { probe.close(() => { resolve(true) }) })
  })
}

describe('acryl-node-server', () => {
  it('serves the router over a real socket with the peer and port as connection facts', async () => {
    const ctx = await boot()
    ctx.router.route('/', new Acryl().get('/who', c => c.json({ peer: connectionOf(c).remoteAddress, port: connectionOf(c).localPort })))
    const body = await (await fetch(`${ctx.nodeServer.url}/who`)).json() as { peer: string, port: number }
    expect(ctx.nodeServer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u)
    expect(body.port).toBe(ctx.nodeServer.port)
    expect(body.peer).toMatch(/127\.0\.0\.1/u)
    expect((await fetch(`${ctx.nodeServer.url}/missing`)).status).toBe(404)
  })

  it('hands a request body to the handler', async () => {
    const ctx = await boot()
    ctx.router.route('/', new Acryl().post('/echo', async c => c.json(await c.req.json())))
    const response = await fetch(`${ctx.nodeServer.url}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"n":1}' })
    expect(await response.json()).toEqual({ n: 1 })
  })

  it('serves files from disk through a mounted app', async () => {
    const ctx = await boot()
    const root = fileURLToPath(new URL('./adapter/assets', import.meta.url))
    ctx.router.route('/', new Acryl().use('/static/*', nodeServer.serveStatic({ root })))
    const found = await fetch(`${ctx.nodeServer.url}/static/plain.txt`)
    expect(found.status).toBe(200)
    expect(found.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await found.text()).toBe(readFileSync(`${root}/static/plain.txt`, 'utf8'))
    expect((await fetch(`${ctx.nodeServer.url}/static/missing.txt`)).status).toBe(404)
  })

  it('aborts the handler signal when the client goes away', async () => {
    const ctx = await boot()
    let aborted!: () => void
    const seen = new Promise<void>(resolve => { aborted = resolve })
    let started!: () => void
    const handling = new Promise<void>(resolve => { started = resolve })
    ctx.router.route('/', new Acryl().get('/wait', c => new Promise<Response>(resolve => {
      c.req.raw.signal.addEventListener('abort', () => { aborted(); resolve(new Response(null, { status: 499 })) }, { once: true })
      started()
    })))
    const client = new AbortController()
    const pending = fetch(`${ctx.nodeServer.url}/wait`, { signal: client.signal }).catch(() => undefined)
    // Abort once the handler runs, not after a guessed delay: an abort before the request arrives would leave the handler never called.
    await handling
    client.abort()
    await seen
    await pending
  })

  it('scans to the next free port when the configured one is taken', async () => {
    const taken = await occupy()
    try {
      const ctx = await boot({ port: taken.port, scan: 20 })
      expect(ctx.nodeServer.port).toBeGreaterThan(taken.port)
      expect(ctx.nodeServer.port).toBeLessThanOrEqual(taken.port + 20)
    } finally {
      await taken.release()
    }
  })

  it('moves on from a port Windows reserves (EACCES) as from a taken one, and only on Windows', () => {
    const error = (code: string) => Object.assign(new Error(code), { code })
    expect(nodeServer.isPortUnavailable(error('EADDRINUSE'), 'linux')).toBe(true)
    expect(nodeServer.isPortUnavailable(error('EADDRINUSE'), 'win32')).toBe(true)
    expect(nodeServer.isPortUnavailable(error('EACCES'), 'win32')).toBe(true)
    expect(nodeServer.isPortUnavailable(error('EACCES'), 'linux')).toBe(false)
    expect(nodeServer.isPortUnavailable(error('EACCES'), 'darwin')).toBe(false)
    expect(nodeServer.isPortUnavailable(error('EADDRNOTAVAIL'), 'win32')).toBe(false)
    expect(nodeServer.isPortUnavailable(new Error('no code'), 'win32')).toBe(false)
  })

  it('scans past several taken ports and is ready when the plugin settles', async () => {
    const held: Array<{ port: number, release: () => Promise<void> }> = []
    try {
      const first = await occupy()
      held.push(first)
      // The next few ports too, where they are free to take: the server has to try each before it settles.
      for (let port = first.port + 1; port <= first.port + 5; port += 1) {
        const blocker = createServer()
        const ok = await new Promise<boolean>(resolve => { blocker.once('error', () => { resolve(false) }); blocker.listen(port, '127.0.0.1', () => { resolve(true) }) })
        if (ok) held.push({ port, release: () => new Promise<void>(resolve => blocker.close(() => { resolve() })) })
      }
      const ctx = await boot({ port: first.port, scan: 20 })
      expect(held.map(entry => entry.port)).not.toContain(ctx.nodeServer.port)
      expect(ctx.nodeServer.port).toBeGreaterThan(first.port)
      expect(ctx.nodeServer.port).toBeLessThanOrEqual(first.port + 20)
    } finally {
      for (const entry of held) await entry.release()
    }
  })

  it('fails the plugin when no port in the scan range is free', async () => {
    const taken = await occupy()
    try {
      const ctx = await routed()
      const fiber = ctx.plugin(nodeServer, { port: taken.port, scan: 0 })
      // A settled fiber rejects with its startup error.
      await expect(Promise.resolve(fiber)).rejects.toThrow(`no free port from ${String(taken.port)} to ${String(taken.port)}`)
      expect(fiber.state).toBe(3) // FAILED
    } finally {
      await taken.release()
    }
  })

  it('on dispose ends open event streams and frees the port', async () => {
    const ctx = await boot()
    ctx.router.route('/', new Acryl().get('/events', c => streamSSE(c, async stream => {
      await stream.writeSSE({ data: 'hello' })
      await new Promise<void>(resolve => { stream.onAbort(resolve) })
    })))
    const port = ctx.nodeServer.port
    const response = await fetch(`${ctx.nodeServer.url}/events`)
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('data: hello')
    await ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(ctx), 1)
    const ended = await reader.read().then(result => result.done, () => true)
    expect(ended).toBe(true)
    expect(await portIsFree(port)).toBe(true)
  })

  it('reloads without leaking a listener', async () => {
    const ctx = await routed()
    const ports: number[] = []
    for (let round = 0; round < 5; round += 1) {
      const fiber = ctx.plugin(nodeServer, {})
      await fiber
      ports.push(ctx.nodeServer.port)
      await fiber.dispose()
    }
    for (const port of ports) expect(await portIsFree(port)).toBe(true)
  })
})
