/**
 * The router as a Cordis service (spec 046, M1): the shared conformance suite through a real `Context`, then the
 * lifecycle mechanics the repo protocol requires: PENDING while the provider is missing, reactivation when it appears,
 * provider replacement without duplicate registrations, disposal, repeated mount and reload, and in-flight abort.
 */

import { Context, type FiberState } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, Config, name, type Router } from '../src/index.ts'
import { conformance, type Candidate } from './conformance.ts'

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
const config: Config = { trailingSlash: 'strict' }

async function mountRouter(): Promise<{ ctx: Context, router: Router }> {
  const ctx = root()
  ctx.plugin(provider, config)
  await settle()
  return { ctx, router: ctx.router }
}

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

conformance('the Router service in a Cordis Context', async () => {
  const { router } = await mountRouter()
  const candidate: Candidate = {
    route: (method, path, handler) => router.route(method, path, handler),
    use: (path, middleware) => router.use(path, middleware),
    fetch: request => router.fetch(request),
    size: () => router.size,
  }
  return candidate
})

/** A consumer plugin that needs `router` and registers one route, the way the market will. */
function consumer(path: string, label: string) {
  return {
    name: `consumer${label}`,
    inject: ['router'],
    apply(ctx: Context): void {
      ctx.router.get(path, c => c.text(label))
    },
  }
}

const get = (router: Router, path: string): Promise<Response> => router.fetch(new Request(`http://acryl.test${path}`))

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

  it('removes a consumer\'s routes when the consumer unloads and leaves other consumers alone', async () => {
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

  it('returns to its baseline after fifty consumer mount and unload cycles', async () => {
    const { ctx, router } = await mountRouter()
    ctx.plugin(consumer('/stay', 'S'))
    await settle()
    const baseline = router.size
    for (let i = 0; i < 50; i += 1) {
      const fiber = ctx.plugin(consumer(`/cycle/${String(i)}`, `C${String(i)}`))
      await settle()
      expect(router.size).toBe(baseline + 1)
      await fiber.dispose()
      await settle()
    }
    expect(router.size).toBe(baseline)
  })

  it('aborts an in-flight request and waits for it when the router is disposed, then answers 503', async () => {
    const ctx = root()
    const fiber = ctx.plugin(provider, config)
    await settle()
    const router = ctx.router
    let aborted = false
    router.get('/slow', async c => {
      await new Promise<void>((_resolve, reject) => { c.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) }, { once: true }) })
      return c.text('late')
    })
    const pending = router.fetch(new Request('http://acryl.test/slow'))
    await settle()

    await fiber.dispose()
    await settle()
    expect(aborted).toBe(true)
    expect((await pending).status).toBe(499)
    expect((await router.fetch(new Request('http://acryl.test/slow'))).status).toBe(503)
  })

  it('forwards the caller\'s own abort to the handler signal', async () => {
    const { router } = await mountRouter()
    let seen = false
    router.get('/slow', async c => {
      await new Promise<void>((_resolve, reject) => { c.signal.addEventListener('abort', () => { seen = true; reject(new Error('aborted')) }, { once: true }) })
      return c.text('x')
    })
    const controller = new AbortController()
    const pending = router.fetch(new Request('http://acryl.test/slow', { signal: controller.signal }))
    await settle()
    controller.abort()
    expect((await pending).status).toBe(499)
    expect(seen).toBe(true)
  })
})
