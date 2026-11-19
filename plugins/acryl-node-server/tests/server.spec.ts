/** The standalone adapter over real sockets: serving, connection facts, port scan, streams, disposal, reload. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
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
    // The test's own folder: the shared fixtures of tests/adapter/assets are changed by other test files running at the same time (serve-static.test.ts removes the read permission of static/plain.txt for one test).
    const root = mkdtempSync(join(tmpdir(), 'node-server-static-'))
    mkdirSync(join(root, 'static'))
    writeFileSync(join(root, 'static', 'plain.txt'), 'This is plain.txt\n')
    try {
      ctx.router.route('/', new Acryl().use('/static/*', nodeServer.serveStatic({ root })))
      const found = await fetch(`${ctx.nodeServer.url}/static/plain.txt`)
      expect(found.status).toBe(200)
      expect(found.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(await found.text()).toBe('This is plain.txt\n')
      expect((await fetch(`${ctx.nodeServer.url}/static/missing.txt`)).status).toBe(404)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
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

  it('a client that goes away fires stream.onAbort, sets stream.aborted and aborts the request signal, over a real socket', async () => {
    const ctx = await boot()
    const seen: { aborted?: boolean, signalAborted?: boolean } = {}
    let finished!: () => void
    const done = new Promise<void>(resolve => { finished = resolve })
    ctx.router.route('/', new Acryl().get('/events', c => streamSSE(c, async stream => {
      await stream.writeSSE({ data: 'hello' })
      await new Promise<void>(resolve => { stream.onAbort(resolve) })
      seen.aborted = stream.aborted
      seen.signalAborted = c.req.raw.signal.aborted
      finished()
    })))
    const client = new AbortController()
    const response = await fetch(`${ctx.nodeServer.url}/events`, { signal: client.signal })
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('data: hello')
    client.abort()
    await reader.read().catch(() => undefined)
    await done
    // The two ways to notice the client leaving agree here: this is the path real browsers take.
    expect(seen).toEqual({ aborted: true, signalAborted: true })
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

  it('a port a browser refuses is skipped in the scan, and only that one, without widening the range', () => {
    // The Fetch standard's bad ports: Chromium refuses a page there (ERR_UNSAFE_PORT), and Node's fetch answers "bad port". 3659 is inside the
    // app port range (plugins/instance hashes into 3100..3999), which is how the gate met it.
    expect(nodeServer.isRestrictedPort(1)).toBe(true)
    expect(nodeServer.isRestrictedPort(3659)).toBe(true)
    expect(nodeServer.isRestrictedPort(6000)).toBe(true)
    expect(nodeServer.isRestrictedPort(3100)).toBe(false)
    expect(nodeServer.isRestrictedPort(3660)).toBe(false)
    expect(nodeServer.RESTRICTED_PORTS.size).toBe(82)
    // The rest of the requested range is tried in order, and the skip does not extend it.
    expect(nodeServer.portCandidates(3650, 20)).toEqual([
      3650, 3651, 3652, 3653, 3654, 3655, 3656, 3657, 3658, 3660, 3661, 3662, 3663, 3664, 3665, 3666, 3667, 3668, 3669, 3670,
    ])
    expect(nodeServer.portCandidates(3650, 9)).toEqual([3650, 3651, 3652, 3653, 3654, 3655, 3656, 3657, 3658])
    // A configured restricted port with no scan has nothing to try: the listener never binds it.
    expect(nodeServer.portCandidates(3659, 0)).toEqual([])
    // Port 0 is the system's choice, and the ports it hands out are above the restricted range.
    expect(nodeServer.portCandidates(0, 20)).toEqual([0])
  })

  it('never binds a port a browser refuses: a restricted start moves to the next usable port, which fetch reaches', async () => {
    const ctx = await boot({ port: 3659, scan: 20 })
    ctx.router.route('/', new Acryl().get('/ok', c => c.text('ok')))
    expect(nodeServer.isRestrictedPort(ctx.nodeServer.port)).toBe(false)
    expect(ctx.nodeServer.port).toBeGreaterThan(3659)
    expect(ctx.nodeServer.port).toBeLessThanOrEqual(3679)
    // The very client that refused 3659 ("bad port") reaches the app where it actually listens.
    expect(await (await fetch(`${ctx.nodeServer.url}/ok`)).text()).toBe('ok')
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
      await expect(Promise.resolve(fiber)).rejects.toThrow(`no usable port from ${String(taken.port)} to ${String(taken.port)}`)
      expect(fiber.state).toBe(3) // FAILED
    } finally {
      await taken.release()
    }
  })

  it('fails rather than binds a configured port a browser refuses when the scan may not move on', async () => {
    const ctx = await routed()
    const fiber = ctx.plugin(nodeServer, { port: 3659, scan: 0 })
    await expect(Promise.resolve(fiber)).rejects.toThrow('no usable port from 3659 to 3659')
    expect(fiber.state).toBe(3) // FAILED
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
    // The stream is not a request that can finish: the stop waits its bounded grace, then cuts it. The bound allows that grace; a hang still fails.
  }, 10_000)

  it('lets a request already in flight finish when stop() begins, then frees the port', async () => {
    const ctx = await boot()
    let began: () => void = () => {}
    const started = new Promise<void>(resolve => { began = resolve })
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    ctx.router.route('/', new Acryl().get('/slow', async (c) => {
      began()
      await gate
      return c.json({ finished: true })
    }))
    const port = ctx.nodeServer.port
    const response = fetch(`${ctx.nodeServer.url}/slow`)
    await started
    // Calling stop() while the router and the rest of the tree are still alive: the server drains under its own grace, and only after this does an
    // app dispose the context. The router's own disposal aborts in-flight requests by design, so this order is what keeps a save from being cut.
    const stopping = ctx.nodeServer.stop()
    await new Promise(resolve => setTimeout(resolve, 100))
    release()
    const answered = await response
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ finished: true })
    await stopping
    expect(await portIsFree(port)).toBe(true)
  })

  it('stop() is idempotent, and the disposer after it is a no-op', async () => {
    const ctx = await boot()
    await ctx.nodeServer.stop()
    await ctx.nodeServer.stop()
    expect(await portIsFree(ctx.nodeServer.port)).toBe(true)
  })

  it('a whole-root dispose lets a request in flight finish with its full body, inside the grace plus a short settle', async () => {
    const ctx = await boot()
    let began: () => void = () => {}
    const started = new Promise<void>(resolve => { began = resolve })
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    ctx.router.route('/', new Acryl().get('/save', async (c) => {
      began()
      await gate
      return c.json({ saved: true })
    }))
    const port = ctx.nodeServer.port
    const response = fetch(`${ctx.nodeServer.url}/save`)
    await started
    const startedAt = Date.now()
    const disposal = ctx.fiber.dispose()
    await new Promise(resolve => setTimeout(resolve, 100))
    release()
    const answered = await response
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ saved: true })
    await disposal
    contexts.splice(contexts.indexOf(ctx), 1)
    // Both drains (the router's and the server's) run in the same window; a request that finished early adds no grace of its own.
    expect(Date.now() - startedAt).toBeLessThan(2000 + 300)
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
