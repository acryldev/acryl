/**
 * The sign-in Host plugin activated as the app activates it: real Cordis, the real `router` and `routerHttp` over a `webServer` that
 * listens on loopback, and an `acrylWeb` that records any exact route registered on it. Covers what the route tests cannot: one prefix
 * mount and no exact routes, PENDING until the router and the harness services are there, the mount leaving with the plugin, and
 * reloads without duplicates.
 */

import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { afterEach, describe, expect, it } from 'vitest'
import * as signIn from '../src/index.ts'
import { SIGN_IN_API_PREFIX, SIGN_IN_BEGIN_PATH, SIGN_IN_PROVIDERS_PATH } from '../src/contract.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

/** A `webServer` on a real loopback socket with the Host's prefix rule, and an `acrylWeb` that records exact routes. */
async function host() {
  const prefixes = new Map<string, Handler>()
  const exact: string[] = []
  let mounts = 0
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const match = [...prefixes.keys()].filter(prefix => path === prefix || path.startsWith(`${prefix}/`)).sort((a, b) => b.length - a.length)[0]
    if (match === undefined) { res.statusCode = 404; res.end(); return }
    void prefixes.get(match)?.(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }))
  const webServer = {
    register: (route: { kind: 'prefix', path: string, handler: Handler }) => {
      if (prefixes.has(route.path)) throw new Error(`duplicate prefix ${route.path}`)
      prefixes.set(route.path, route.handler)
      mounts += 1
      return () => { prefixes.delete(route.path) }
    },
  }
  const acrylWeb = {
    host: '127.0.0.1',
    port,
    register: (route: { path: string }) => { exact.push(route.path); return () => { exact.splice(exact.indexOf(route.path), 1) } },
  }
  return { port, origin: `http://127.0.0.1:${String(port)}`, prefixes, exact, mounts: () => mounts, webServer, acrylWeb }
}

const authorization = { list: () => [], begin: async () => ({ status: 'cancelled' }) }
const credentials = { describeRecord: async () => ({ configured: false }) }

async function boot(options: { router?: boolean, services?: boolean } = {}) {
  const served = await host()
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  if (options.services !== false) {
    ctx.provide('authorization' as never, authorization as never)
    ctx.provide('credentials' as never, credentials as never)
  }
  // Each dependency's fiber, then the consumer's: a PENDING fiber's await returns at once, so a fixed wait would only race the load.
  const router = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: applyRouter })
    await http
    await fiber
  }
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(signIn)
  if (options.router !== false) await router()
  const send = (method: string, path: string, headers: Record<string, string>, body?: string) =>
    new Promise<{ status: number, body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: served.port, method, path, headers }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: text }) })
      })
      req.on('error', reject)
      req.end(body)
    })
  const page = { origin: served.origin, 'sec-fetch-site': 'same-origin' }
  const get = (path: string, headers: Record<string, string> = page) => send('GET', path, headers)
  const post = (path: string, value: unknown) => send('POST', path, { ...page, 'content-type': 'application/json' }, JSON.stringify(value))
  return { ...served, ctx, fiber, router, get, post }
}

describe('acryl-sign-in Host plugin', () => {
  it('serves its five routes through one router mount and registers no exact webServer route', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([SIGN_IN_API_PREFIX])
    expect(app.exact).toEqual([])
    expect(await app.get(SIGN_IN_PROVIDERS_PATH)).toEqual({ status: 200, body: JSON.stringify({ providers: [], signedIn: false }) })
    expect((await app.get(SIGN_IN_PROVIDERS_PATH, { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await app.get(SIGN_IN_PROVIDERS_PATH, {})).status).toBe(403)
  })

  it('stays PENDING without a router and activates when one appears', async () => {
    const app = await boot({ router: false })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    await app.router()
    expect(app.fiber.state).toBe(ACTIVE)
    expect((await app.get(SIGN_IN_PROVIDERS_PATH)).status).toBe(200)
  })

  it('waits for the harness authorization and credentials services, and takes its mount down while one is gone', async () => {
    const app = await boot({ services: false })
    expect(app.fiber.state).toBe(PENDING)
    app.ctx.provide('authorization' as never, authorization as never)
    await app.fiber
    expect(app.fiber.state).toBe(PENDING)
    const withdraw = app.ctx.provide('credentials' as never, credentials as never) as unknown as () => void
    await app.fiber
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([SIGN_IN_API_PREFIX])
    withdraw()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    expect((await app.get(SIGN_IN_PROVIDERS_PATH)).status).toBe(404)
    app.ctx.provide('credentials' as never, credentials as never)
    await app.fiber
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([SIGN_IN_API_PREFIX])
  })

  it('takes its mount with it when it unloads, and three reloads mount it once each', async () => {
    const app = await boot()
    await app.fiber.dispose()
    expect(app.prefixes.size).toBe(0)
    expect((await app.get(SIGN_IN_PROVIDERS_PATH)).status).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(signIn)
      await again
      expect(again.state).toBe(ACTIVE)
      expect([...app.prefixes.keys()]).toEqual([SIGN_IN_API_PREFIX])
      expect((await app.get(SIGN_IN_PROVIDERS_PATH)).status).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
    expect(app.mounts()).toBe(4)
  })

  it('makes the signed-in provider the default for new sessions when the current default has no credential', async () => {
    const app = await boot({ services: false })
    const saved: unknown[] = []
    let finish: (() => void) | undefined
    const finished = new Promise<void>(resolve => { finish = resolve })
    app.ctx.provide('settings' as never, { describe: () => [], update: async () => {} } as never)
    app.ctx.provide('llm' as never, {
      listConfigurableProviders: () => [],
      // DeepSeek, the current default, is not live (no key), so it cannot answer.
      listProviders: () => [{ id: 'anthropic' }],
      listModels: async () => [{ id: 'claude-fable-5' }, { id: 'claude-sonnet-5' }],
    } as never)
    app.ctx.provide('agentDefaultModel' as never, {
      currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4-pro' }),
      saveSelection: async (next: unknown) => { saved.push(next); finish?.() },
    } as never)
    app.ctx.provide('credentials' as never, { describe: async () => ({ configured: false }), describeRecord: async (key: string) => ({ configured: key === 'llm-pi-ai/anthropic' }) } as never)
    app.ctx.provide('authorization' as never, {
      list: () => [{ key: 'llm-pi-ai/anthropic', label: 'Anthropic', methods: [{ id: 'api-key', label: 'API key' }] }],
      begin: async () => ({ status: 'authorized' }),
    } as never)
    await app.fiber
    expect(app.fiber.state).toBe(ACTIVE)
    const begun = await app.post(SIGN_IN_BEGIN_PATH, { key: 'llm-pi-ai/anthropic', method: 'api-key' })
    expect(begun.status).toBe(200)
    await finished
    expect(saved).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-5' }])
  })
})
