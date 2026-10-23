/**
 * The Web adapter against the real DSH `webServer` listening on a loopback port: a plugin mounts a prefix, requests
 * travel over real HTTP into `router.fetch`, and the lifecycle (PENDING, unload, reload) is observed the way a browser
 * would see it. The router is the built `acryl-router` entry, as production loads it.
 */

import { Context, type FiberState } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, inject, name, type RouterHttp } from '../src/index.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await settle(10) }
  throw new Error(`timed out waiting for: ${label}`)
}

const adapter = { name, inject, apply }
const router = { name: routerName, apply: routerApply }

/** A whole stack on one root context: webServer on an OS-assigned port, the router, and the adapter. */
async function stack(): Promise<{ ctx: Context, base: () => string }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
  ctx.plugin(router, { trailingSlash: 'strict' })
  ctx.plugin(adapter)
  await until(() => (ctx as unknown as { webServer?: { port: number } }).webServer?.port !== undefined && ctx.routerHttp !== undefined, 'the stack to start')
  return { ctx, base: () => `http://127.0.0.1:${String((ctx as unknown as { webServer: { port: number } }).webServer.port)}` }
}

function demo(prefix: string, extra?: (ctx: Context) => void) {
  return {
    name: `demo${prefix.replaceAll('/', '-')}`,
    inject: ['router', 'routerHttp'],
    apply(ctx: Context): void {
      ctx.routerHttp.mount(prefix)
      ctx.router.get(`${prefix}/hello/:who`, c => c.json({ hello: c.params['who'], q: c.url.searchParams.get('q'), host: c.req.headers.get('host') !== null }))
      ctx.router.post(`${prefix}/echo`, async c => c.json({ got: await c.req.text(), type: c.req.headers.get('content-type') }, 201))
      ctx.router.get(`${prefix}/cookies`, () => {
        const headers = new Headers()
        headers.append('set-cookie', 'a=1; Path=/')
        headers.append('set-cookie', 'b=2; Path=/')
        return new Response('ok', { headers })
      })
      ctx.router.get(`${prefix}/stream`, () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('one,')); controller.enqueue(new TextEncoder().encode('two')); controller.close() },
      })))
      ctx.router.get(`${prefix}/peer`, c => c.json({ remote: c.connection.remoteAddress ?? null, localPort: c.connection.localPort ?? null }))
      extra?.(ctx)
    },
  }
}

describe('acryl-router-http against a real webServer', () => {
  it('serves a mounted prefix over HTTP: params, query, JSON, status', async () => {
    const { ctx, base } = await stack()
    ctx.plugin(demo('/api/demo'))
    await settle(20)
    const response = await fetch(`${base()}/api/demo/hello/zed%20x?q=1`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ hello: 'zed x', q: '1', host: true })
  })

  it('passes the socket peer address as connection info, not as part of the request', async () => {
    const { ctx, base } = await stack()
    ctx.plugin(demo('/api/demo'))
    await settle(20)
    const body = await (await fetch(`${base()}/api/demo/peer`)).json() as { remote: string | null, localPort: number | null }
    expect(['127.0.0.1', '::ffff:127.0.0.1']).toContain(body.remote)
    expect(body.localPort).toBe(Number(new URL(base()).port))
  })

  it('streams a request body into the handler and keeps status and headers on the way out', async () => {
    const { ctx, base } = await stack()
    ctx.plugin(demo('/api/demo'))
    await settle(20)
    const response = await fetch(`${base()}/api/demo/echo`, { method: 'POST', body: 'payload', headers: { 'content-type': 'text/plain' } })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ got: 'payload', type: 'text/plain' })
  })

  it('keeps repeated set-cookie headers separate and streams a response body', async () => {
    const { ctx, base } = await stack()
    ctx.plugin(demo('/api/demo'))
    await settle(20)
    const cookies = await fetch(`${base()}/api/demo/cookies`)
    expect(cookies.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect(await (await fetch(`${base()}/api/demo/stream`)).text()).toBe('one,two')
  })

  it('answers the router\'s 404 and 405 below the mount, and answers HEAD without a body', async () => {
    const { ctx, base } = await stack()
    ctx.plugin(demo('/api/demo'))
    await settle(20)
    const missing = await fetch(`${base()}/api/demo/none`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not Found')
    expect((await fetch(`${base()}/api/demo/echo`)).status).toBe(405)
    const head = await fetch(`${base()}/api/demo/hello/a`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toContain('application/json')
    expect(await head.text()).toBe('')
  })

  it('aborts the handler signal when the HTTP client disconnects', async () => {
    const { ctx, base } = await stack()
    let aborted = false
    ctx.plugin(demo('/api/demo', c => {
      c.router.get('/api/demo/slow', async r => {
        await new Promise<void>((_resolve, reject) => { r.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) }, { once: true }) })
        return r.text('never')
      })
    }))
    await settle(20)
    const controller = new AbortController()
    const pending = fetch(`${base()}/api/demo/slow`, { signal: controller.signal }).catch(() => undefined)
    await settle(50)
    controller.abort()
    await pending
    await until(() => aborted, 'the handler to see the disconnect')
  })

  it('stops serving the prefix when the owning plugin unloads, and serves it again on reload, fifty times', async () => {
    const { ctx, base } = await stack()
    for (let i = 0; i < 50; i += 1) {
      const fiber = ctx.plugin(demo('/api/demo'))
      await settle(5)
      expect((await fetch(`${base()}/api/demo/hello/a`)).status).toBe(200)
      await fiber.dispose()
      await settle(5)
      // Unmounted: the webServer has no fallback in this stack, so it answers its own empty 404, not the router's body.
      const gone = await fetch(`${base()}/api/demo/hello/a`)
      expect(gone.status).toBe(404)
      expect(await gone.text()).toBe('')
    }
    expect(ctx.router.size).toBe(0)
  })

  it('stays PENDING while webServer is missing and activates when it appears', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.plugin(router, { trailingSlash: 'strict' })
    const fiber = ctx.plugin(adapter)
    await settle(20)
    expect(fiber.state).toBe(PENDING)
    ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
    await until(() => fiber.state === ACTIVE, 'the adapter to activate')
  })

  it('refuses a prefix that is not a clean path and a prefix another plugin already mounted', async () => {
    const { ctx } = await stack()
    const http: RouterHttp = ctx.routerHttp
    expect(() => http.mount('no-slash')).toThrow(/mountable/)
    expect(() => http.mount('/trailing/')).toThrow(/mountable/)
    http.mount('/api/once')
    expect(() => http.mount('/api/once')).toThrow(/duplicate/)
  })
})
