/**
 * The state service through a real Cordis `Context`: cells are owned by the plugin that made them, readable and
 * subscribable in process, and streamed through the router as server-sent events, with cancellation and disposal.
 */

import { Context } from '@deepseek-ai/cordis'
import { apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.ts'

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function system(withRouter = true): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  if (withRouter) ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  ctx.plugin({ name, apply })
  await settle()
  return ctx
}

/** A tiny SSE reader over a Response body. */
async function events(response: Response, count: number): Promise<string[]> {
  const reader = response.body!.getReader()
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
  reader.releaseLock()
  return out
}

describe('acryl-state', () => {
  it('creates cells owned by the calling plugin and removes them when it unloads', async () => {
    const ctx = await system()
    const fiber = ctx.plugin({ name: 'owner', inject: ['state'], apply(c: Context) { c.state.cell('owner.count', 1) } })
    await settle()
    expect(ctx.state.keys()).toEqual(['owner.count'])
    expect(ctx.state.find<number>('owner.count')?.get()).toBe(1)
    await fiber.dispose()
    await settle()
    expect(ctx.state.keys()).toEqual([])
    expect(ctx.state.find('owner.count')).toBeUndefined()
  })

  it('rejects a bad or duplicate key', async () => {
    const ctx = await system()
    ctx.state.cell('ok.key', 0)
    expect(() => ctx.state.cell('ok.key', 1)).toThrow(/already in use/)
    expect(() => ctx.state.cell('Bad Key', 1)).toThrow(/dotted lowercase/)
    expect(() => ctx.state.derive('ok.key', [], () => 1)).toThrow(/already in use/)
  })

  it('derives a cell from others and detaches it when its owner unloads', async () => {
    const ctx = await system()
    const a = ctx.state.cell<number>('n.a', 1)
    const fiber = ctx.plugin({ name: 'deriver', inject: ['state'], apply(c: Context) { c.state.derive('n.double', [a] as const, x => x * 2) } })
    await settle()
    expect(ctx.state.find<number>('n.double')?.get()).toBe(2)
    a.set(5)
    expect(ctx.state.find<number>('n.double')?.get()).toBe(10)
    await fiber.dispose()
    await settle()
    expect(ctx.state.find('n.double')).toBeUndefined()
  })

  it('serves keys and values as JSON on the router, read-only', async () => {
    const ctx = await system()
    ctx.state.cell('app.title', 'hello')
    const keys = await ctx.router.fetch(new Request('http://acryl.test/api/state'))
    expect(await keys.json()).toEqual({ keys: ['app.title'] })
    const one = await ctx.router.fetch(new Request('http://acryl.test/api/state/app.title'))
    expect(await one.json()).toEqual({ key: 'app.title', value: 'hello' })
    expect((await ctx.router.fetch(new Request('http://acryl.test/api/state/none'))).status).toBe(404)
    expect((await ctx.router.fetch(new Request('http://acryl.test/api/state/app.title', { method: 'PUT', body: '"x"' }))).status).toBe(405)
    expect(ctx.state.find('app.title')?.get()).toBe('hello')
  })

  it('streams the value now and every change as server-sent events, and ends when the caller aborts', async () => {
    const ctx = await system()
    const cell = ctx.state.cell<number>('app.count', 0)
    const controller = new AbortController()
    const response = await ctx.router.fetch(new Request('http://acryl.test/api/state/app.count/events', { signal: controller.signal }))
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reading = events(response, 3)
    await settle(5)
    cell.set(1)
    cell.set(2)
    expect(await reading).toEqual(['event: value\ndata: 0', 'event: value\ndata: 1', 'event: value\ndata: 2'])
    controller.abort()
    await settle(5)
    // After the abort the stream no longer holds a subscription on the cell.
    let notified = 0
    const probe = ctx.state.find<number>('app.count')!.subscribe(() => { notified += 1 })
    cell.set(3)
    probe()
    expect(notified).toBe(1)
  })

  it('closes every open stream when the router is disposed', async () => {
    const ctx = await system()
    ctx.state.cell<number>('app.count', 0)
    const routerFiber = [...[...ctx.registry.values()].find(runtime => runtime.name === routerName)!.fibers][0]!
    const response = await ctx.router.fetch(new Request('http://acryl.test/api/state/app.count/events'))
    const reader = response.body!.getReader()
    await reader.read()
    const ended = reader.read()
    await routerFiber.dispose()
    await expect(ended).resolves.toMatchObject({ done: true })
  })

  it('works with no router: cells and subscriptions only, no routes', async () => {
    const ctx = await system(false)
    const cell = ctx.state.cell<string>('plain.value', 'a')
    const seen: string[] = []
    cell.subscribe(value => seen.push(value))
    cell.set('b')
    expect(seen).toEqual(['b'])
  })
})
