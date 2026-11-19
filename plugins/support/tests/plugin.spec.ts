/**
 * The support Host plugin activated as the app activates it: real Cordis, the real `router` and `routerHttp` over a `webServer` that
 * listens on loopback, and an `acrylWeb` that records any exact route registered on it. Covers what the route tests cannot: one prefix
 * mount and no exact route, the download over a real socket, PENDING without a router, and the mount leaving with the plugin.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { afterEach, describe, expect, it } from 'vitest'
import * as support from '../src/index.ts'
import { SUPPORT_API_PREFIX, SUPPORT_DIAGNOSTICS_PATH } from '../src/contract.ts'

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

async function boot(options: { router?: boolean } = {}) {
  const served = await host()
  const home = mkdtempSync(join(tmpdir(), 'acryl-support-plugin-'))
  cleanups.push(() => { rmSync(home, { recursive: true, force: true }) })
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  // Each dependency's fiber, then the consumer's: a PENDING fiber's await returns at once, so a fixed wait would only race the load.
  const router = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: applyRouter })
    await http
    await fiber
  }
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(support)
  if (options.router !== false) await router()
  const get = (path: string) => new Promise<{ status: number, type: string | undefined }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: served.port, path, headers: { referer: `${served.origin}/settings`, 'sec-fetch-site': 'same-origin' } }, (res) => {
      res.resume()
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'] }) })
    })
    req.on('error', reject)
    req.end()
  })
  return { ...served, home, ctx, fiber, router, get }
}

describe('the support Host plugin', () => {
  it('serves the download through one router mount, no exact webServer route, and keeps log files in the engine home', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([SUPPORT_API_PREFIX])
    expect(app.exact).toEqual([])
    expect(await app.get(SUPPORT_DIAGNOSTICS_PATH)).toEqual({ status: 200, type: 'application/zip' })
    expect(existsSync(join(app.home, '.dsh', 'logs'))).toBe(true)
  })

  it('stays PENDING without a router and activates when one appears', async () => {
    const app = await boot({ router: false })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    await app.router()
    expect(app.fiber.state).toBe(ACTIVE)
    expect((await app.get(SUPPORT_DIAGNOSTICS_PATH)).status).toBe(200)
  })

  it('takes its mount with it when it unloads, and a reload mounts once', async () => {
    const app = await boot()
    await app.fiber.dispose()
    expect(app.prefixes.size).toBe(0)
    expect((await app.get(SUPPORT_DIAGNOSTICS_PATH)).status).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(support)
      await again
      expect([...app.prefixes.keys()]).toEqual([SUPPORT_API_PREFIX])
      expect((await app.get(SUPPORT_DIAGNOSTICS_PATH)).status).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
  })
})
