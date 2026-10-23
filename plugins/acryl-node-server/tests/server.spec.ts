/** The standalone adapter over real sockets: serving, connection facts, port scan, streams, disposal, reload. */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { App, apply as routerApply, connectionOf, name as routerName } from 'acryl-router'
import { streamSSE } from 'acryl-router/helpers'
import { afterEach, describe, expect, it } from 'vitest'
import * as nodeServer from '../src/index.ts'

/** The plugin as an object, so its config is the partial `apply` accepts rather than the Loader's validated shape. */
const plugin = { name: nodeServer.name, inject: nodeServer.inject, apply: nodeServer.apply }
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

async function boot(config: Partial<nodeServer.Config> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name: routerName, apply: routerApply })
  ctx.plugin(plugin, config)
  await settle()
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
    ctx.router.route('/', new App().get('/who', c => c.json({ peer: connectionOf(c).remoteAddress, port: connectionOf(c).localPort })))
    const body = await (await fetch(`${ctx.nodeServer.url}/who`)).json() as { peer: string, port: number }
    expect(ctx.nodeServer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u)
    expect(body.port).toBe(ctx.nodeServer.port)
    expect(body.peer).toMatch(/127\.0\.0\.1/u)
    expect((await fetch(`${ctx.nodeServer.url}/missing`)).status).toBe(404)
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

  it('fails the plugin when no port in the scan range is free', async () => {
    const taken = await occupy()
    try {
      const ctx = new Context()
      contexts.push(ctx)
      ctx.plugin({ name: routerName, apply: routerApply })
      const fiber = ctx.plugin(plugin, { port: taken.port, scan: 0 })
      await settle()
      expect(fiber.state).toBe(3) // FAILED
    } finally {
      await taken.release()
    }
  })

  it('on dispose ends open event streams and frees the port', async () => {
    const ctx = await boot()
    ctx.router.route('/', new App().get('/events', c => streamSSE(c, async stream => {
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
    const ctx = new Context()
    contexts.push(ctx)
    ctx.plugin({ name: routerName, apply: routerApply })
    const ports: number[] = []
    for (let round = 0; round < 5; round += 1) {
      const fiber = ctx.plugin(plugin, {})
      await settle()
      ports.push(ctx.nodeServer.port)
      await fiber.dispose()
    }
    for (const port of ports) expect(await portIsFree(port)).toBe(true)
  })
})
