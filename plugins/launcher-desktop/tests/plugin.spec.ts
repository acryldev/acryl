/**
 * The ACRYL screen's Host plugin activated as the app activates it: real Cordis, the real `router` and `routerHttp` over a `webServer` that
 * listens on loopback, and an `acrylWeb` that records any exact route registered on it. Covers what the route tests cannot: one prefix
 * mount and no exact routes, PENDING until the router and the harness services are there, the mount leaving with the plugin, and
 * reloads without duplicates.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { afterEach, describe, expect, it } from 'vitest'
import * as launcher from '../src/index.ts'
import { LAUNCHER_API_PREFIX, LAUNCHER_NEW_PATH, LAUNCHER_STATE_PATH } from '../src/contract.ts'

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

const home = mkdtempSync(join(tmpdir(), 'acryl-launcher-desktop-home-'))
cleanups.push(() => { rmSync(home, { recursive: true, force: true }) })
const appInstance = { home, dshHome: join(home, '.dsh') }

async function boot(options: { router?: boolean, instance?: boolean } = {}) {
  const served = await host()
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  if (options.instance !== false) ctx.provide('appInstance' as never, appInstance as never)
  // Each dependency's fiber, then the consumer's: a PENDING fiber's await returns at once, so a fixed wait would only race the load.
  const router = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: applyRouter })
    await http
    await fiber
  }
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(launcher)
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
  const post = (path: string, value: unknown, headers: Record<string, string> = { ...page, 'content-type': 'application/json' }) => send('POST', path, headers, JSON.stringify(value))
  return { ...served, ctx, fiber, router, get, post }
}

describe('acryl-launcher-desktop Host plugin', () => {
  it('serves its routes through one router mount, registers no exact webServer route, and lists the apps of the home it is given', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([LAUNCHER_API_PREFIX])
    expect(app.exact).toEqual([])
    const state = await app.get(LAUNCHER_STATE_PATH)
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body)).toMatchObject({ apps: [], appsFolder: join(dirname(home), 'ACRYL'), job: null })
    expect((await app.get(LAUNCHER_STATE_PATH, { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await app.get(LAUNCHER_STATE_PATH, {})).status).toBe(403)
  })

  it('refuses a change that is not same-origin JSON, and a request body that is not what the route takes', async () => {
    const app = await boot()
    expect((await app.post(LAUNCHER_NEW_PATH, {}, { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' })).status).toBe(403)
    expect((await app.post(LAUNCHER_NEW_PATH, {}, { origin: app.origin, 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' })).status).toBe(415)
    expect((await app.post(LAUNCHER_NEW_PATH, { where: '/x', name: 'shop', starter: 'blank', surface: 'hologram' })).status).toBe(400)
    // A refusal the service explains is 409 with its reason, and nothing was started.
    const refused = await app.post(LAUNCHER_NEW_PATH, { where: '/x', name: 'My App', starter: 'blank', surface: 'web' })
    expect(refused.status).toBe(409)
    expect(JSON.parse(refused.body)).toEqual({ error: 'lower case letters, digits and dashes, starting with a letter' })
    expect((await app.post(LAUNCHER_NEW_PATH, { where: '/x', name: 'shop', starter: 'blank', surface: 'tui' })).status).toBe(409)
  })

  it('stays PENDING without a router and activates when one appears', async () => {
    const app = await boot({ router: false })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    await app.router()
    expect(app.fiber.state).toBe(ACTIVE)
    expect((await app.get(LAUNCHER_STATE_PATH)).status).toBe(200)
  })

  it('waits for the appInstance service, and takes its mount down while it is gone', async () => {
    const app = await boot({ instance: false })
    expect(app.fiber.state).toBe(PENDING)
    const withdraw = app.ctx.provide('appInstance' as never, appInstance as never) as unknown as () => void
    await app.fiber
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([LAUNCHER_API_PREFIX])
    withdraw()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    expect((await app.get(LAUNCHER_STATE_PATH)).status).toBe(404)
  })

  it('takes its mount with it when it unloads, and three reloads mount it once each', async () => {
    const app = await boot()
    await app.fiber.dispose()
    expect(app.prefixes.size).toBe(0)
    expect((await app.get(LAUNCHER_STATE_PATH)).status).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(launcher)
      await again
      expect(again.state).toBe(ACTIVE)
      expect([...app.prefixes.keys()]).toEqual([LAUNCHER_API_PREFIX])
      expect((await app.get(LAUNCHER_STATE_PATH)).status).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
    expect(app.mounts()).toBe(4)
  })
})
