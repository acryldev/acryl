/** The route helpers (spec 046): bounded body reading, server-sent events, and validation. */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, name, type Router } from '../src/index.ts'
import { readBytes, readJson, readText, streamSSE, valid, validate } from '../src/helpers/index.ts'
import { bodyLimit } from '../src/middleware/index.ts'

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function mount(): Promise<{ ctx: Context, router: Router }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply })
  await settle()
  return { ctx, router: ctx.router }
}

describe('readJson / readText / readBytes', () => {
  it('reads a JSON body, and an empty body as no bytes', async () => {
    const { router } = await mount()
    router.post('/j', async c => c.json({ got: await readJson(c) }))
    router.post('/t', async c => c.text(String((await readBytes(c)).byteLength)))
    expect(await (await router.request('/j', { method: 'POST', body: '{"a":1}' })).json()).toEqual({ got: { a: 1 } })
    expect(await (await router.request('/t', { method: 'POST' })).text()).toBe('0')
  })

  it('answers 400 for bad JSON and 413 over the limit, counting the bytes it reads', async () => {
    const { router } = await mount()
    router.post('/j', async c => c.json(await readJson(c, { maxBytes: 16 })))
    expect((await router.request('/j', { method: 'POST', body: '{nope' })).status).toBe(400)
    const big = await router.request('/j', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(100) }) })
    expect(big.status).toBe(413)
  })

  it('stops a chunked body that has no declared length at the limit', async () => {
    const { router } = await mount()
    router.post('/t', async c => c.text(await readText(c, { maxBytes: 8 })))
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('0123456789')); controller.close() } })
    const response = await router.request(new Request('http://localhost/t', { method: 'POST', body: stream, duplex: 'half' } as RequestInit))
    expect(response.status).toBe(413)
  })

  it('uses the limit the bodyLimit middleware set', async () => {
    const { router } = await mount()
    router.use(bodyLimit({ maxBytes: 4 }))
    router.post('/t', async c => c.text(await readText(c)))
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('abcdefgh')); controller.close() } })
    expect((await router.request(new Request('http://localhost/t', { method: 'POST', body: stream, duplex: 'half' } as RequestInit))).status).toBe(413)
  })
})

describe('streamSSE', () => {
  async function read(response: Response, count: number): Promise<string[]> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const out: string[] = []
    while (out.length < count) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (let at = buffer.indexOf('\n\n'); at !== -1; at = buffer.indexOf('\n\n')) { out.push(buffer.slice(0, at)); buffer = buffer.slice(at + 2) }
    }
    reader.releaseLock()
    return out
  }

  it('sends events with ids, names, JSON and multi-line text, and a comment', async () => {
    const { router } = await mount()
    router.get('/s', c => streamSSE(c, stream => {
      stream.send({ n: 1 }, { event: 'tick', id: '7' })
      stream.send('line one\nline two')
      stream.comment('keep-alive')
    }))
    const events = await read(await router.request('/s'), 3)
    expect(events).toEqual(['id: 7\nevent: tick\ndata: {"n":1}', 'data: line one\ndata: line two', ': keep-alive'])
  })

  it('runs its cleanup once when the client aborts, and ends the stream', async () => {
    const { router } = await mount()
    let cleaned = 0
    router.get('/s', c => streamSSE(c, () => () => { cleaned += 1 }))
    const controller = new AbortController()
    const response = await router.request('/s', { signal: controller.signal })
    const reader = response.body!.getReader()
    controller.abort()
    await expect(reader.read()).resolves.toMatchObject({ done: true })
    await settle(5)
    expect(cleaned).toBe(1)
  })

  it('lets the server close the stream, and runs the cleanup once even if cancelled afterwards', async () => {
    const { router } = await mount()
    let cleaned = 0
    router.get('/s', c => streamSSE(c, stream => { stream.send('only'); stream.close(); return () => { cleaned += 1 } }))
    const response = await router.request('/s')
    const reader = response.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    await expect(reader.read()).resolves.toMatchObject({ done: true })
    await reader.cancel()
    expect(cleaned).toBe(1)
  })

  it('is ended and awaited when its plugin unloads the router', async () => {
    const { ctx, router } = await mount()
    let cleaned = 0
    router.get('/s', c => streamSSE(c, () => () => { cleaned += 1 }))
    const response = await router.request('/s')
    const reader = response.body!.getReader()
    const ended = reader.read()
    await ctx.fiber.dispose()
    contexts.length = 0
    await expect(ended).resolves.toMatchObject({ done: true })
    expect(cleaned).toBe(1)
  })
})

describe('validate', () => {
  const Body = z.object({ name: z.string().required(), age: z.number().default(0) })

  it('hands the handler the parsed value, with defaults applied', async () => {
    const { router } = await mount()
    router.post('/u', validate('json', Body), c => c.json(valid<{ name: string, age: number }>(c, 'json')))
    const response = await router.request('/u', { method: 'POST', body: '{"name":"ada"}' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'ada', age: 0 })
  })

  it('answers 400 with the issues for an invalid body, query or parameter', async () => {
    const { router } = await mount()
    router.post('/u', validate('json', Body), c => c.text('ok'))
    router.get('/q', validate('query', z.object({ page: z.string().required() })), c => c.text('ok'))
    router.get('/p/:id', validate('param', z.object({ id: z.string().pattern(/^\d+$/u).required() })), c => c.text('ok'))
    const bad = await router.request('/u', { method: 'POST', body: '{}' })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toBe('invalid json')
    expect((await router.request('/q')).status).toBe(400)
    expect((await router.request('/q?page=2')).status).toBe(200)
    expect((await router.request('/p/abc')).status).toBe(400)
    expect((await router.request('/p/42')).status).toBe(200)
  })

  it('tells the author when valid() is used without validate()', async () => {
    const { router } = await mount()
    router.get('/x', c => c.text(String(valid(c, 'json'))))
    expect((await router.request('/x')).status).toBe(500)
  })
})

describe('streamSSE keepalive and validate on bad JSON', () => {
  it('sends a comment line on an idle stream and stops when it ends', async () => {
    const { router } = await mount()
    router.get('/s', c => streamSSE(c, () => undefined, { keepAliveMs: 10 }))
    const response = await router.request('/s')
    const reader = response.body!.getReader()
    const chunk = new TextDecoder().decode((await reader.read()).value)
    expect(chunk).toBe(': keepalive\n\n')
    await reader.cancel()
  })

  it('answers 400, not 500, when the body is not JSON', async () => {
    const { router } = await mount()
    router.post('/v', validate('json', z.object({ a: z.number() }) as never), c => c.json(valid(c, 'json')))
    expect((await router.request('/v', { method: 'POST', body: '{nope' })).status).toBe(400)
  })
})
