/**
 * The plugin-admin Host plugin activated as the app activates it: real Cordis, the real `router` and `routerHttp` over a `webServer` that
 * listens on loopback, and an `acrylWeb` that records any exact route registered on it. Covers what the route tests cannot: one prefix
 * mount and no exact routes, PENDING without a router, the lifecycle routes following the lifecycle service, and reloads without
 * duplicates.
 */

import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { afterEach, describe, expect, it } from 'vitest'
import * as adminPlugin from '../src/index.ts'
import { unlockedBlueprintSource } from '../src/index.ts'
import { PLUGIN_ARCHITECTURE_PATH } from '../src/architecture/contract.ts'
import { PLUGIN_ADMIN_API_PREFIX, PLUGIN_LIFECYCLE_PATH } from '../src/lifecycle/contract.ts'

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
      return () => { prefixes.delete(route.path) }
    },
  }
  const acrylWeb = {
    host: '127.0.0.1',
    port,
    register: (route: { path: string }) => { exact.push(route.path); return () => { exact.splice(exact.indexOf(route.path), 1) } },
  }
  return { port, origin: `http://127.0.0.1:${String(port)}`, prefixes, exact, webServer, acrylWeb }
}

const lifecycleService = {
  snapshot: () => ({ entries: [] }),
  setEnabled: async () => { throw new Error('unused') },
  reload: async () => { throw new Error('unused') },
}

async function boot(options: { router?: boolean, lifecycle?: boolean } = {}) {
  const served = await host()
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  if (options.lifecycle !== false) ctx.provide('acrPluginLifecycle' as never, lifecycleService as never)
  // Each dependency's fiber, then the consumer's: a PENDING fiber's await returns at once, so a fixed wait would only race the load.
  const router = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: applyRouter })
    await http
    await fiber
  }
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(adminPlugin)
  if (options.router !== false) await router()
  const get = (path: string) => new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: served.port, path, headers: { origin: served.origin, 'sec-fetch-site': 'same-origin' } }, (res) => {
      res.resume()
      res.on('end', () => { resolve(res.statusCode ?? 0) })
    })
    req.on('error', reject)
    req.end()
  })
  return { ...served, ctx, fiber, router, get }
}

describe('acryl-plugin-admin Host plugin (one plugin for every surface)', () => {
  it('serves every route through one router mount, no exact webServer route', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([PLUGIN_ADMIN_API_PREFIX])
    expect(app.exact).toEqual([])
    expect(await app.get(PLUGIN_ARCHITECTURE_PATH)).toBe(200)
    expect(await app.get(PLUGIN_LIFECYCLE_PATH)).toBe(200)
  })

  it('stays PENDING without a router and activates when one appears', async () => {
    const app = await boot({ router: false })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    await app.router()
    expect(app.fiber.state).toBe(ACTIVE)
    expect(await app.get(PLUGIN_ARCHITECTURE_PATH)).toBe(200)
  })

  it('serves the lifecycle routes only while a surface publishes the lifecycle service, keeping the architecture route', async () => {
    const app = await boot({ lifecycle: false })
    expect(await app.get(PLUGIN_ARCHITECTURE_PATH)).toBe(200)
    expect(await app.get(PLUGIN_LIFECYCLE_PATH)).toBe(404)

    const withdraw = app.ctx.provide('acrPluginLifecycle' as never, lifecycleService as never)
    await app.fiber
    expect(await app.get(PLUGIN_LIFECYCLE_PATH)).toBe(200)

    withdraw()
    expect(await app.get(PLUGIN_LIFECYCLE_PATH)).toBe(404)
    expect(await app.get(PLUGIN_ARCHITECTURE_PATH)).toBe(200)
    expect(app.fiber.state).toBe(ACTIVE)
  })

  it('takes its mount with it when it unloads, and a reload mounts once', async () => {
    const app = await boot()
    await app.fiber.dispose()
    expect(app.prefixes.size).toBe(0)
    expect(await app.get(PLUGIN_ARCHITECTURE_PATH)).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(adminPlugin)
      await again
      expect(again.state).toBe(ACTIVE)
      expect([...app.prefixes.keys()]).toEqual([PLUGIN_ADMIN_API_PREFIX])
      expect(await app.get(PLUGIN_LIFECYCLE_PATH)).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
  })
})

describe('unlockedBlueprintSource (spec 040 T083: an honest identity for a surface with no locked Blend)', () => {
  const saved = { id: process.env.ACRYL_BLUEPRINT_ID, name: process.env.ACRYL_BLUEPRINT_NAME }
  afterEach(() => {
    for (const [key, value] of [['ACRYL_BLUEPRINT_ID', saved.id], ['ACRYL_BLUEPRINT_NAME', saved.name]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('reports a Blueprint by the display name the engine published, built-in or custom', () => {
    process.env.ACRYL_BLUEPRINT_ID = 'acryl.ide'
    process.env.ACRYL_BLUEPRINT_NAME = 'ACRYL'
    expect(unlockedBlueprintSource([{}, {}])).toEqual({ locked: false, id: 'acryl.ide', name: 'ACRYL', rows: [{}, {}] })
    process.env.ACRYL_BLUEPRINT_ID = '/a/custom-blueprint.yaml'
    process.env.ACRYL_BLUEPRINT_NAME = 'Acme Notes'
    expect(unlockedBlueprintSource([])).toEqual({ locked: false, id: '/a/custom-blueprint.yaml', name: 'Acme Notes', rows: [] })
  })

  it('falls back to the id itself when only the id is set', () => {
    process.env.ACRYL_BLUEPRINT_ID = '/a/custom-blueprint.yaml'
    delete process.env.ACRYL_BLUEPRINT_NAME
    expect(unlockedBlueprintSource([])).toEqual({ locked: false, id: '/a/custom-blueprint.yaml', name: '/a/custom-blueprint.yaml', rows: [] })
  })

  it('is undefined with no selection set (a surface with a locked Blend never falls back to this)', () => {
    delete process.env.ACRYL_BLUEPRINT_ID
    expect(unlockedBlueprintSource([])).toBeUndefined()
  })
})
