/**
 * The router as a Cordis service: mounts owned by the plugin that made them, and the lifecycle mechanics the repo protocol requires -
 * PENDING while the provider is missing, reactivation when it appears, provider replacement without duplicate registrations, disposal,
 * repeated mount and reload, in-flight abort, and streams that end with the router or with the plugin that serves them. Routing itself is covered by the core's own suite.
 */

import { Context, type FiberState } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { streamSSE } from '../src/helpers/index.ts'
import { apply, App, Config, connectionOf, HTTPException, name, type Router } from '../src/index.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const DISPOSED = 4 as FiberState.DISPOSED

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function root(): Context {
  const ctx = new Context()
  contexts.push(ctx)
  return ctx
}

const provider = { name, apply }
const config: Config = { trailingSlash: 'strict', disposeGraceMs: 2000 }

async function mountRouter(): Promise<{ ctx: Context, router: Router }> {
  const ctx = root()
  ctx.plugin(provider, config)
  await settle()
  return { ctx, router: ctx.router }
}

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

/** A consumer plugin that needs `router` and mounts one route, the way the Market does. */
function consumer(path: string, label: string) {
  return {
    name: `consumer${label}`,
    inject: ['router'],
    apply(ctx: Context): void {
      ctx.router.route('/', new App().get(path, c => c.text(label)))
    },
  }
}

const get = (router: Router, path: string): Promise<Response> => router.fetch(new Request(`http://acryl.test${path}`))

describe('acryl-router mounts', () => {
  it('serves a mounted app under its path, with the app\'s own routes, middleware and error handler', async () => {
    const { router } = await mountRouter()
    const api = new App()
      .use(async (c, next) => { await next(); c.header('x-api', 'yes') })
      .get('/items/:id', c => c.json({ id: c.req.param('id') }))
      .get('/boom', () => { throw new Error('boom') })
      .onError((error, c) => c.json({ handled: error instanceof Error ? error.message : 'unknown' }, 418))
    router.route('/api', api)

    const item = await get(router, '/api/items/a%20b')
    expect(await item.json()).toEqual({ id: 'a b' })
    expect(item.headers.get('x-api')).toBe('yes')
    const boom = await get(router, '/api/boom')
    expect(boom.status).toBe(418)
    expect(await boom.json()).toEqual({ handled: 'boom' })
    expect((await get(router, '/items/a')).status).toBe(404)
  })

  it('removes a mount with its remover, idempotently, and keeps the others', async () => {
    const { router } = await mountRouter()
    const removeA = router.route('/', new App().get('/a', c => c.text('a')))
    router.route('/', new App().get('/b', c => c.text('b')))
    expect((await get(router, '/a')).status).toBe(200)
    removeA()
    removeA()
    expect((await get(router, '/a')).status).toBe(404)
    expect(await (await get(router, '/b')).text()).toBe('b')
    router.route('/', new App().get('/a', c => c.text('a2')))
    expect(await (await get(router, '/a')).text()).toBe('a2')
  })

  it('runs mounts in the order they were made, so an earlier mount\'s middleware wraps a later mount\'s routes', async () => {
    const { router } = await mountRouter()
    router.route('/', new App().use('/guarded/*', async c => c.text('denied', 401)))
    router.route('/', new App().get('/guarded/x', c => c.text('secret')).get('/open', c => c.text('open')))
    expect((await get(router, '/guarded/x')).status).toBe(401)
    expect(await (await get(router, '/open')).text()).toBe('open')
  })

  it('takes one router-wide error handler and one not-found handler, owned by the caller', async () => {
    const { router } = await mountRouter()
    router.route('/', new App().get('/boom', () => { throw new Error('boom') }).get('/teapot', () => { throw new HTTPException(418, { message: 'short' }) }))
    expect((await get(router, '/boom')).status).toBe(500)
    expect((await get(router, '/teapot')).status).toBe(418)

    const removeError = router.onError((_error, c) => c.text('custom', 503))
    const removeNotFound = router.notFound(c => c.text('nothing here', 404))
    expect(() => router.onError((_error, c) => c.text('second'))).toThrow(/already registered/)
    expect((await get(router, '/boom')).status).toBe(503)
    expect(await (await get(router, '/missing')).text()).toBe('nothing here')
    removeError()
    removeNotFound()
    expect((await get(router, '/boom')).status).toBe(500)
  })

  it('treats /a and /a/ as one path when trailingSlash is ignore', async () => {
    const ctx = root()
    ctx.plugin(provider, { trailingSlash: 'ignore', disposeGraceMs: 2000 })
    await settle()
    ctx.router.route('/', new App().get('/a', c => c.text('a')))
    expect((await get(ctx.router, '/a/')).status).toBe(200)
  })

  it('hands the transport\'s connection info to the handler and gives an in-process call an empty one', async () => {
    const { router } = await mountRouter()
    router.route('/', new App().get('/who', c => c.json({ remote: connectionOf(c).remoteAddress ?? null, port: connectionOf(c).localPort ?? null })))
    const over = await router.fetch(new Request('http://acryl.test/who'), { remoteAddress: '127.0.0.1', localPort: 4000 })
    expect(await over.json()).toEqual({ remote: '127.0.0.1', port: 4000 })
    const inProcess = await router.request('/who')
    expect(await inProcess.json()).toEqual({ remote: null, port: null })
  })
})

describe('acryl-router lifecycle through Cordis', () => {
  it('leaves a consumer PENDING while router is missing and activates it when router appears', async () => {
    const ctx = root()
    const fiber = ctx.plugin(consumer('/c', 'A'))
    await settle()
    expect(fiber.state).toBe(PENDING)

    ctx.plugin(provider, config)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(await (await get(ctx.router, '/c')).text()).toBe('A')
    expect(ctx.router.size).toBe(1)
  })

  it('removes a consumer\'s mounts when the consumer unloads and leaves other consumers alone', async () => {
    const { ctx, router } = await mountRouter()
    const a = ctx.plugin(consumer('/a', 'A'))
    ctx.plugin(consumer('/b', 'B'))
    await settle()
    expect(router.size).toBe(2)

    await a.dispose()
    await settle()
    expect(a.state).toBe(DISPOSED)
    expect((await get(router, '/a')).status).toBe(404)
    expect(await (await get(router, '/b')).text()).toBe('B')
    expect(router.size).toBe(1)
  })

  it('labels a mount by its path with one child per route, so no label grows with the app (an inspector caps label length)', async () => {
    const { ctx, router } = await mountRouter()
    const big = new App().use('/api/*', async (_c, next) => { await next() })
    for (let i = 0; i < 60; i += 1) big.get(`/api/a-fairly-long-resource-name-${String(i)}`, c => c.text('ok'))
    const fiber = ctx.plugin({ name: 'big', inject: ['router'], apply: (inner: Context) => { inner.router.route('/', big) } })
    await settle()
    const [mount, ...rest] = fiber.getEffects()
    expect(rest).toEqual([])
    expect(mount?.label).toBe('acryl-router: route /')
    expect(mount?.children).toHaveLength(61)
    expect(mount?.children[0]?.label).toBe('acryl-router: serves ALL /api/*')
    expect(mount?.children.every(child => child.label.length < 100 && child.children.length === 0)).toBe(true)
    expect(router.size).toBe(1)
    await fiber.dispose()
    expect(router.size).toBe(0)
  })

  it('replaces the provider without leaving doubled registrations: consumers re-register exactly once', async () => {
    const ctx = root()
    const first = ctx.plugin(provider, config)
    const fiber = ctx.plugin(consumer('/c', 'A'))
    await settle()
    const oldRouter = ctx.router
    expect(fiber.state).toBe(ACTIVE)

    await first.dispose()
    await settle()
    expect(fiber.state).toBe(PENDING)
    expect(oldRouter.size).toBe(0)

    ctx.plugin(provider, config)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(ctx.router).not.toBe(oldRouter)
    expect(ctx.router.size).toBe(1)
    expect(await (await get(ctx.router, '/c')).text()).toBe('A')
  })

  it('serves the routes an app had when it was mounted, whatever else changes later', async () => {
    const { ctx, router } = await mountRouter()
    const app = new App().get('/early', c => c.text('early'))
    router.route('/', app)
    app.get('/late', c => c.text('late'))
    expect((await get(router, '/early')).status).toBe(200)
    expect((await get(router, '/late')).status).toBe(404)
    // Another plugin's mount recomposes the router; the late route still is not served.
    ctx.plugin(consumer('/other', 'other'))
    await settle()
    expect((await get(router, '/other')).status).toBe(200)
    expect((await get(router, '/late')).status).toBe(404)
  })

  it('serves two plugins on the same path in mount order, and hands the path to the other when the first unloads', async () => {
    const { ctx, router } = await mountRouter()
    const first = ctx.plugin(consumer('/same', 'first'))
    await settle()
    ctx.plugin(consumer('/same', 'second'))
    await settle()
    expect(await (await get(router, '/same')).text()).toBe('first')
    await first.dispose()
    await settle()
    expect(await (await get(router, '/same')).text()).toBe('second')
  })

  it('runs a reloaded plugin\'s handler once per request: reloading leaves no duplicate route behind, ten times', async () => {
    const { ctx, router } = await mountRouter()
    let calls = 0
    const counting = {
      name: 'counting',
      inject: ['router'],
      apply(inner: Context): void {
        inner.router.route('/', new App().use(async (_c, next) => { calls += 1; await next() }).get('/count', c => c.text(String(calls))))
      },
    }
    for (let round = 0; round < 10; round += 1) {
      const fiber = ctx.plugin(counting)
      await settle()
      expect(router.size).toBe(1)
      calls = 0
      expect(await (await get(router, '/count')).text()).toBe('1')
      await fiber.dispose()
      await settle()
      expect(router.size).toBe(0)
    }
  })

  it('returns to its baseline after fifty consumer mount and unload cycles', async () => {
    const { ctx, router } = await mountRouter()
    ctx.plugin(consumer('/stay', 'S'))
    await settle()
    const baseline = router.size
    for (let i = 0; i < 50; i += 1) {
      const fiber = ctx.plugin(consumer(`/cycle/${String(i)}`, `C${String(i)}`))
      await settle()
      expect(router.size).toBe(baseline + 1)
      expect(await (await get(router, `/cycle/${String(i)}`)).text()).toBe(`C${String(i)}`)
      await fiber.dispose()
      await settle()
    }
    expect(router.size).toBe(baseline)
    expect((await get(router, '/cycle/0')).status).toBe(404)
  })

  it('aborts an in-flight request and waits for it when the router is disposed, then answers 503', async () => {
    const ctx = root()
    const fiber = ctx.plugin(provider, config)
    await settle()
    const router = ctx.router
    let aborted = false
    router.route('/', new App().get('/slow', async c => {
      await new Promise<void>((_resolve, reject) => { c.req.raw.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) }, { once: true }) })
      return c.text('late')
    }))
    const pending = get(router, '/slow')
    await settle()

    await fiber.dispose()
    await settle()
    expect(aborted).toBe(true)
    expect((await pending).status).toBe(499)
    expect((await get(router, '/slow')).status).toBe(503)
  })

  it('forwards the caller\'s own abort to the handler signal', async () => {
    const { router } = await mountRouter()
    let seen = false
    router.route('/', new App().get('/slow', async c => {
      await new Promise<void>((_resolve, reject) => { c.req.raw.signal.addEventListener('abort', () => { seen = true; reject(new Error('aborted')) }, { once: true }) })
      return c.text('x')
    }))
    const controller = new AbortController()
    const pending = router.fetch(new Request('http://acryl.test/slow', { signal: controller.signal }))
    await settle()
    controller.abort()
    expect((await pending).status).toBe(499)
    expect(seen).toBe(true)
  })

  it('ends a server-sent-event stream when the router is disposed: the stream\'s abort cleanup runs and the reader sees the end', async () => {
    const ctx = root()
    const fiber = ctx.plugin(provider, config)
    await settle()
    let cleaned = false
    ctx.router.route('/', new App().get('/events', c => streamSSE(c, async stream => {
      stream.onAbort(() => { cleaned = true })
      await stream.writeSSE({ data: 'first' })
      while (!stream.aborted) await stream.sleep(10)
    })))
    const response = await get(ctx.router, '/events')
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n')

    await fiber.dispose()
    expect(cleaned).toBe(true)
    await expect(reader.read()).resolves.toMatchObject({ done: true })
  })

  it('ends the stream a plugin opened when that plugin unloads, and leaves another plugin\'s request running', async () => {
    const { ctx, router } = await mountRouter()
    let cleaned = false
    let otherAborted = false
    let release!: () => void
    const streaming = ctx.plugin({
      name: 'streaming',
      inject: ['router'],
      apply(inner: Context): void {
        inner.router.route('/', new App().get('/events', c => streamSSE(c, async stream => {
          stream.onAbort(() => { cleaned = true })
          await stream.writeSSE({ data: 'first' })
          while (!stream.aborted) await stream.sleep(10)
        })))
      },
    })
    ctx.plugin({
      name: 'other',
      inject: ['router'],
      apply(inner: Context): void {
        inner.router.route('/', new App().get('/slow', async c => {
          c.req.raw.signal.addEventListener('abort', () => { otherAborted = true }, { once: true })
          await new Promise<void>(resolve => { release = resolve })
          return c.text('done')
        }))
      },
    })
    await settle()
    const response = await get(router, '/events')
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n')
    const slow = get(router, '/slow')
    await settle()

    await streaming.dispose()
    expect(cleaned).toBe(true)
    await expect(reader.read()).resolves.toMatchObject({ done: true })
    expect(otherAborted).toBe(false)
    release()
    expect(await (await slow).text()).toBe('done')
  })

  it('aborts a request still inside an unloading plugin\'s middleware, but not one that middleware already passed on', async () => {
    const { ctx, router } = await mountRouter()
    let guardAborted = false
    let handlerAborted = false
    let release!: () => void
    const guard = ctx.plugin({
      name: 'guard',
      inject: ['router'],
      apply(inner: Context): void {
        inner.router.route('/', new App()
          .use('/held/*', async (c, next) => {
            c.req.raw.signal.addEventListener('abort', () => { guardAborted = true }, { once: true })
            await new Promise<void>((_resolve, reject) => { c.req.raw.signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true }) })
            await next()
          })
          .use('/passed/*', async (_c, next) => { await next() }))
      },
    })
    ctx.plugin({
      name: 'handler',
      inject: ['router'],
      apply(inner: Context): void {
        inner.router.route('/', new App()
          .get('/held/x', c => c.text('held'))
          .get('/passed/x', c => streamSSE(c, async stream => {
            stream.onAbort(() => { handlerAborted = true })
            await stream.writeSSE({ data: 'open' })
            await new Promise<void>(resolve => { release = resolve })
          })))
      },
    })
    await settle()
    const held = get(router, '/held/x')
    const passed = await get(router, '/passed/x')
    const reader = passed.body!.getReader()
    await reader.read()

    await guard.dispose()
    expect(guardAborted).toBe(true)
    expect((await held).status).toBe(499)
    expect(handlerAborted).toBe(false)
    release()
    await expect(reader.read()).resolves.toMatchObject({ done: true })
  })

  it('keeps a request in flight through waitUntil until its task settles', async () => {
    const ctx = root()
    const fiber = ctx.plugin(provider, config)
    await settle()
    let finished = false
    ctx.router.route('/', new App().get('/later', c => {
      c.executionCtx.waitUntil(new Promise<void>(resolve => { setTimeout(() => { finished = true; resolve() }, 30) }))
      return c.text('now')
    }))
    expect(await (await get(ctx.router, '/later')).text()).toBe('now')
    expect(finished).toBe(false)
    await fiber.dispose()
    expect(finished).toBe(true)
  })

  it('gives up on a request that ignores the abort after the grace period instead of hanging disposal', async () => {
    const ctx = root()
    const fiber = ctx.plugin(provider, { trailingSlash: 'strict', disposeGraceMs: 30 })
    await settle()
    ctx.router.route('/', new App().get('/stuck', c => { c.executionCtx.waitUntil(new Promise(() => undefined)); return c.text('x') }))
    await get(ctx.router, '/stuck')
    const started = Date.now()
    await fiber.dispose()
    expect(Date.now() - started).toBeLessThan(1000)
    expect(fiber.state).toBe(DISPOSED)
  })
})
