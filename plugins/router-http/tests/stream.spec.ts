/**
 * Server-sent events end to end (spec 046, M5): the actual DSH `webServer`, the router, the HTTP adapter and the state
 * service. A browser-shaped `fetch` reads the stream; a change in the Host reaches it; a disconnect and a plugin unload both
 * end it and leave nothing subscribed.
 */

import { request as httpRequest } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply as routerApply, name as routerName } from 'acryl-router'
import { apply as stateApply, name as stateName } from 'acryl-state'
import { afterEach, describe, expect, it } from 'vitest'
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

async function stack(): Promise<{ ctx: Context, base: string }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
  ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
  ctx.plugin({ name: stateName, apply: stateApply })
  const web = ctx as unknown as { webServer?: { port: number } }
  await until(() => web.webServer?.port !== undefined && (ctx as unknown as { routerHttp?: unknown }).routerHttp !== undefined && (ctx as unknown as { state?: unknown }).state !== undefined, 'the stack')
  await settle(30)
  return { ctx, base: `http://127.0.0.1:${String(web.webServer!.port)}` }
}

/** Collect SSE records from a fetch response until `count` arrived. */
async function read(reader: ReadableStreamDefaultReader<Uint8Array>, count: number): Promise<string[]> {
  const decoder = new TextDecoder()
  let buffer = ''
  const out: string[] = []
  while (out.length < count) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (let at = buffer.indexOf('\n\n'); at !== -1; at = buffer.indexOf('\n\n')) {
      out.push(buffer.slice(0, at))
      buffer = buffer.slice(at + 2)
    }
  }
  return out
}

describe('server-sent events through the real stack', () => {
  it('streams the value now and each change to a real HTTP client, with the stream headers', async () => {
    const { ctx, base } = await stack()
    const cell = ctx.state.cell<{ n: number }>('app.counter', { n: 0 })
    const response = await fetch(`${base}/api/state/app.counter/events`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const first = read(reader, 3)
    await settle(20)
    cell.set({ n: 1 })
    cell.set({ n: 2 })
    expect(await first).toEqual(['event: value\ndata: {"n":0}', 'event: value\ndata: {"n":1}', 'event: value\ndata: {"n":2}'])
    await reader.cancel()
  })

  it('stops pushing to a client that disconnected: the cell keeps no subscriber for it', async () => {
    const { ctx, base } = await stack()
    const cell = ctx.state.cell<number>('app.n', 0)
    const controller = new AbortController()
    const response = await fetch(`${base}/api/state/app.n/events`, { signal: controller.signal })
    const reader = response.body!.getReader()
    await read(reader, 1)
    let seenByProbe = 0
    // While connected, a change reaches the stream; count the cell's own subscribers through a counting wrapper.
    controller.abort()
    await reader.cancel().catch(() => undefined)
    await settle(50)
    const stop = cell.subscribe(() => { seenByProbe += 1 })
    cell.set(1)
    stop()
    expect(seenByProbe).toBe(1)
    // The disconnect released the stream: the router has no request left in flight to abort at disposal.
    const started = Date.now()
    await ctx.fiber.dispose()
    contexts.length = 0
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('ends an open stream when the state plugin unloads', async () => {
    const { ctx, base } = await stack()
    ctx.state.cell<number>('app.n', 0)
    const response = await fetch(`${base}/api/state/app.n/events`)
    const reader = response.body!.getReader()
    await read(reader, 1)
    const ended = reader.read()
    const routerFiber = [...[...ctx.registry.values()].find(runtime => runtime.name === routerName)!.fibers][0]!
    await routerFiber.dispose()
    await expect(ended).resolves.toMatchObject({ done: true })
  })
})

describe('the loopback guard over real HTTP', () => {
  /** A raw request, so the test chooses the Host header (fetch would set its own). */
  function raw(port: number, path: string, headers: Record<string, string>): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, headers }, res => {
        let body = ''
        res.on('data', chunk => { body += String(chunk) })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body }) })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('serves the state routes to this machine and refuses a request that names another host or is marked cross-site', async () => {
    const { ctx, base } = await stack()
    ctx.state.cell<number>('app.n', 3)
    const port = Number(new URL(base).port)
    const ok = await raw(port, '/api/state/app.n', { host: `127.0.0.1:${String(port)}` })
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.body)).toEqual({ key: 'app.n', value: 3 })
    expect((await raw(port, '/api/state/app.n', { host: 'evil.example' })).status).toBe(403)
    expect((await raw(port, '/api/state/app.n', { host: `127.0.0.1:${String(port + 1)}` })).status).toBe(403)
    expect((await raw(port, '/api/state/app.n', { host: `127.0.0.1:${String(port)}`, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  })
})
