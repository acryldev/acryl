import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { FRAME_GRAPH_EVENTS_PATH, FRAME_GRAPH_PATH, parseGraphEvents, parseGraphView } from '../src/graph-contract.ts'
import { createGraphApi } from '../src/client/graph-api.ts'
import { frameRoutes } from '../src/index.ts'
import { createGraphPort, GraphRecorder, inspectCordisContext, recordFibers, sourceFinder } from '../src/plugin-graph.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const temp = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'frame-graph-')))
  dirs.push(dir)
  return dir
}

/** A Cordis context with a provider and a consumer of one service, and a plugin nested in neither. */
async function composed() {
  const ctx = new Context()
  const provider = { name: 'alpha-plugin', apply(inner: Context) { inner.effect(() => inner.reflect.provide('alpha', { hello: true }), 'provide alpha') } }
  const consumer = { name: 'beta-plugin', inject: ['alpha'], apply(inner: Context) { inner.effect(() => () => {}, 'beta effect') } }
  const providerFiber = ctx.plugin(provider)
  const consumerFiber = ctx.plugin(consumer)
  await providerFiber.await()
  await consumerFiber.await()
  return { ctx, providerFiber, consumerFiber }
}

describe('the plugin graph of a live Cordis context', () => {
  it('lists every fiber with its phase, what it provides and its effects, and joins a consumer to its provider', async () => {
    const { ctx } = await composed()
    const graph = inspectCordisContext(ctx, 'host')
    const alpha = graph.nodes.find(node => node.name === 'alpha-plugin')
    const beta = graph.nodes.find(node => node.name === 'beta-plugin')
    expect(alpha).toMatchObject({ phase: 'active', provides: ['alpha'] })
    expect(beta).toMatchObject({ phase: 'active' })
    expect(beta?.effects).toContain('beta effect')
    const joined = graph.edges.find(edge => edge.kind === 'inject' && edge.from === beta?.uid)
    expect(joined).toMatchObject({ to: alpha?.uid, service: 'alpha', resolved: true })
    expect(graph.edges.some(edge => edge.kind === 'provider' && edge.from === alpha?.uid && edge.to === beta?.uid)).toBe(true)
    expect(graph.edges.filter(edge => edge.kind === 'nesting').length).toBeGreaterThanOrEqual(2)
  })

  it('shows a consumer whose service nothing provides as pending, with an unresolved relation', async () => {
    const ctx = new Context()
    ctx.plugin({ name: 'lonely', inject: ['nobody'], apply() {} })
    const graph = inspectCordisContext(ctx, 'host')
    const lonely = graph.nodes.find(node => node.name === 'lonely')
    expect(lonely?.phase).toBe('pending')
    expect(graph.edges.find(edge => edge.kind === 'inject' && edge.from === lonely?.uid)).toMatchObject({ service: 'nobody', resolved: false })
  })
})

describe('the numbered list of fiber changes', () => {
  it('records a plugin being created, coming up and being removed, in order, each with its phases', async () => {
    const ctx = new Context()
    const recorder = new GraphRecorder()
    const stop = recordFibers(ctx, recorder)
    const fiber = ctx.plugin({ name: 'cart', apply() {} })
    await fiber.await()
    fiber.dispose()
    await fiber.await().catch(() => {})
    stop()
    const { events, seq } = recorder.since(0)
    expect(seq).toBe(events.length)
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1))
    const mine = events.filter(event => event.name === 'cart')
    expect(mine[0]).toMatchObject({ kind: 'created' })
    expect(mine.some(event => event.kind === 'status' && event.to === 'active')).toBe(true)
    expect(mine.some(event => event.kind === 'removed')).toBe(true)
  })

  it('stops recording when stopped', async () => {
    const ctx = new Context()
    const recorder = new GraphRecorder()
    const stop = recordFibers(ctx, recorder)
    stop()
    await ctx.plugin({ name: 'after', apply() {} }).await()
    expect(recorder.since(0).events).toEqual([])
  })

  it('answers a request for events at once when there are some, when the next one happens, and with none after the wait', async () => {
    const recorder = new GraphRecorder()
    recorder.record({ uid: 1, name: 'a', kind: 'created' })
    expect((await recorder.wait(0, 1000)).events).toHaveLength(1)
    const waited = recorder.wait(1, 5000)
    setTimeout(() => { recorder.record({ uid: 2, name: 'b', kind: 'status', from: 'loading', to: 'active' }) }, 20)
    const answer = await waited
    expect(answer.events).toHaveLength(1)
    expect(answer.events[0]).toMatchObject({ seq: 2, name: 'b', to: 'active' })
    const started = Date.now()
    expect((await recorder.wait(2, 60)).events).toEqual([])
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  })

  it('lets go of a waiting request when the browser leaves or the Host stops', async () => {
    const recorder = new GraphRecorder()
    const controller = new AbortController()
    const waiting = recorder.wait(0, 60_000, controller.signal)
    controller.abort()
    expect((await waiting).events).toEqual([])
    const released = recorder.wait(0, 60_000)
    recorder.release()
    expect((await released).events).toEqual([])
  })

  it('keeps only the recent changes, numbers still counting', () => {
    const recorder = new GraphRecorder()
    for (let index = 0; index < 230; index += 1) recorder.record({ uid: index, name: `p${String(index)}`, kind: 'created' })
    const { events, seq } = recorder.since(0)
    expect(seq).toBe(230)
    expect(events).toHaveLength(200)
    expect(events[0]?.seq).toBe(31)
  })
})

describe('where a plugin\'s code is', () => {
  const app = (): string => {
    const root = temp()
    mkdirSync(join(root, 'plugins', 'cart'), { recursive: true })
    writeFileSync(join(root, 'plugins', 'cart', 'index.ts'), 'export const name = "cart"\n')
    mkdirSync(join(root, 'plugins', 'declared', 'lib'), { recursive: true })
    writeFileSync(join(root, 'plugins', 'declared', 'plugin.json'), JSON.stringify({ main: 'lib/entry.js' }))
    writeFileSync(join(root, 'plugins', 'declared', 'lib', 'entry.js'), 'export {}\n')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'frame.ts'), 'export {}\n')
    writeFileSync(join(root, 'package.json'), '{"name":"app"}')
    return root
  }

  it('names the file of the app\'s own plugin folder, from the row\'s name, the way the app finds it', () => {
    const root = app()
    const find = sourceFinder(root)
    expect(find('cart', 'cart')).toEqual({ file: join(root, 'plugins', 'cart', 'index.ts'), folder: join(root, 'plugins', 'cart'), inApp: 'plugins/cart/index.ts' })
    expect(find('declared', 'declared')?.inApp).toBe('plugins/declared/lib/entry.js')
  })

  it('names a file by its path from the app folder', () => {
    const root = app()
    expect(sourceFinder(root)('./src/frame.ts', 'frame')).toMatchObject({ inApp: 'src/frame.ts' })
  })

  it('names an installed package by where it really is, with no in-app path to open', () => {
    const found = sourceFinder(app())('yaml', 'yaml')
    expect(found).toBeDefined()
    expect(found?.inApp).toBeUndefined()
    expect(found?.file).toMatch(/yaml/u)
  })

  it('names nothing for what cannot be found, and tries the fiber\'s name when the row has no module', () => {
    const root = app()
    const find = sourceFinder(root)
    expect(find('no-such-plugin-anywhere', 'no-such-plugin-anywhere')).toBeUndefined()
    expect(find(null, 'cart')?.inApp).toBe('plugins/cart/index.ts')
    expect(find(null, 'root')).toBeUndefined()
  })

  it('puts the source on the node of a plugin that has a row', async () => {
    const root = app()
    const ctx = new Context()
    await ctx.plugin({ name: 'cart', apply() {} }).await()
    const graph = inspectCordisContext(ctx, 'host', sourceFinder(root))
    expect(graph.nodes.find(node => node.name === 'cart')?.source?.inApp).toBe('plugins/cart/index.ts')
  })
})

describe('the graph over the frame\'s routes', () => {
  const connection = { connection: { remoteAddress: '127.0.0.1', localPort: 43120 } }
  const get = (path: string) => new Request(`http://127.0.0.1:43120${path}`, { headers: { host: '127.0.0.1:43120', 'sec-fetch-site': 'same-origin', referer: 'http://127.0.0.1:43120/' } })

  it('answers the graph with the number of the newest event, then the events after a number, and the browser reads both', async () => {
    const ctx = new Context()
    const { port, stop } = createGraphPort(ctx, temp())
    const app = frameRoutes({ state: () => Promise.reject(new Error('not asked')), graph: port })
    const api = createGraphApi(async input => app.fetch(get(input), connection))
    const first = await api.read()
    expect(first.snapshot.plane).toBe('host')
    expect(first.snapshot.nodes.length).toBeGreaterThan(0)
    const waiting = api.events(first.seq)
    await ctx.plugin({ name: 'arrives-later', apply() {} }).await()
    const answer = await waiting
    expect(answer.events.some(event => event.name === 'arrives-later')).toBe(true)
    expect(answer.seq).toBeGreaterThan(first.seq)
    const again = await api.read()
    expect(again.snapshot.nodes.some(node => node.name === 'arrives-later')).toBe(true)
    stop()
  })

  it('refuses an events request that does not name a whole number', async () => {
    const ctx = new Context()
    const { port, stop } = createGraphPort(ctx, temp())
    const app = frameRoutes({ state: () => Promise.reject(new Error('not asked')), graph: port })
    const response = await app.fetch(get(`${FRAME_GRAPH_EVENTS_PATH}?after=soon`), connection)
    expect(response.status).toBe(400)
    stop()
  })

  it('has no graph routes when the Host gives none', async () => {
    const app = frameRoutes({ state: () => Promise.reject(new Error('not asked')) })
    expect((await app.fetch(get(FRAME_GRAPH_PATH), connection)).status).toBe(404)
  })

  it('reads an answer back to what was sent, and refuses a malformed one', () => {
    const view = parseGraphView({ seq: 3, snapshot: { capturedAt: 'x', plane: 'host', nodes: [{ uid: 1, name: 'a', phase: 'active', enabled: true, moduleName: 'a', loaderEntryId: 'a', provides: ['s'], effects: ['e'], source: { file: '/f', folder: '/', inApp: 'f' } }], edges: [{ kind: 'inject', from: 1, to: 1, service: 's', resolved: false }] } })
    expect(view.snapshot.nodes[0]?.source).toEqual({ file: '/f', folder: '/', inApp: 'f' })
    expect(() => parseGraphView({ seq: 1, snapshot: { nodes: [{ uid: 'x' }], edges: [] } })).toThrow()
    expect(parseGraphEvents({ seq: 2, events: [{ seq: 1, at: 1, uid: 1, name: 'a', kind: 'status', from: 'loading', to: 'active' }, { nope: true }] }).events).toHaveLength(1)
  })
})
