/**
 * The workspace's Host half activated as the app activates it: real Cordis, the real `router` and `routerHttp` services over a `webServer`
 * that listens on loopback, the real settings service, and an `acrylWeb` that records what is registered on it. Covers what the route tests
 * cannot: one prefix mount and no exact routes, PENDING without a router, the mount leaving with the plugin, and a reload without duplicates.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import * as settingsPlugin from 'acryl-settings'
import { apply as applyRouter, name as routerName } from 'acryl-router'
import * as routerHttpPlugin from 'acryl-router-http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WORKSPACE_CAPABILITIES_PATH } from '../src/capabilities/contract.ts'
import * as workspace from '../src/index.ts'
import { WORKSPACE_API_PREFIX } from '../src/private-route.ts'
import { WORKSPACE_PTY_STREAM_PATH } from '../src/pty/contract.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

// The PTY registry asks the login shell for PATH when it is built (about a second with an interactive zsh); a plain sh keeps each
// activation here about routing, not the developer's shell start-up.
const shell = process.env.SHELL
beforeAll(() => { process.env.SHELL = '/bin/sh' })
afterAll(() => { if (shell === undefined) delete process.env.SHELL; else process.env.SHELL = shell })


/** A `webServer` on a real loopback socket with the Host's rule (exact, then longest prefix), and an `acrylWeb` that records its routes. */
async function host() {
  const prefixes = new Map<string, Handler>()
  const exact: string[] = []
  const upgrades: string[] = []
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
    registerUpgrade: (route: { path: string }) => { upgrades.push(route.path); return () => { upgrades.splice(upgrades.indexOf(route.path), 1) } },
  }
  return { port, origin: `http://127.0.0.1:${String(port)}`, prefixes, exact, upgrades, webServer, acrylWeb }
}

async function boot(options: { router?: boolean } = {}) {
  const served = await host()
  const home = mkdtempSync(join(tmpdir(), 'acryl-workspace-plugin-'))
  cleanups.push(() => { rmSync(home, { recursive: true, force: true }) })
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  await ctx.plugin(settingsPlugin as never, { filename: '' } as never)
  // Each dependency's fiber, then the consumer's: a fiber whose injected service is not yet provided is PENDING, and awaiting it returns at
  // once, so a fixed wait or an early await only races the load.
  const router = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: applyRouter })
    await http
    await fiber
  }
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(workspace)
  if (options.router !== false) await router()
  const get = (path: string, headers: Record<string, string> = { origin: served.origin, 'sec-fetch-site': 'same-origin' }) =>
    new Promise<{ status: number, body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: served.port, path, headers }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body }) })
      })
      req.on('error', reject)
      req.end()
    })
  return { ...served, ctx, fiber, router, get }
}

describe('the workspace Host plugin', () => {
  it('serves every route through one router mount: no exact webServer routes, the terminal stream its only upgrade', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([WORKSPACE_API_PREFIX])
    expect(app.exact).toEqual([])
    expect(app.upgrades).toEqual([WORKSPACE_PTY_STREAM_PATH])
    expect(await app.get(WORKSPACE_CAPABILITIES_PATH)).toEqual({ status: 200, body: JSON.stringify({ chat: false }) })
  })

  it('answers only its own page: another origin and a local program get 403', async () => {
    const app = await boot()
    expect((await app.get(WORKSPACE_CAPABILITIES_PATH, { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await app.get(WORKSPACE_CAPABILITIES_PATH, {})).status).toBe(403)
  })

  it('stays PENDING without a router and activates when one appears', async () => {
    const app = await boot({ router: false })
    expect(app.fiber.state).toBe(PENDING)
    expect(app.prefixes.size).toBe(0)
    await app.router()
    expect(app.fiber.state).toBe(ACTIVE)
    expect((await app.get(WORKSPACE_CAPABILITIES_PATH)).status).toBe(200)
  })

  it('takes its mount and upgrade with it when it unloads, and a reload registers them once', async () => {
    const app = await boot()
    await app.fiber.dispose()
    expect(app.prefixes.size).toBe(0)
    expect(app.upgrades).toEqual([])
    expect((await app.get(WORKSPACE_CAPABILITIES_PATH)).status).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(workspace)
      await again
      expect(again.state).toBe(ACTIVE)
      expect([...app.prefixes.keys()]).toEqual([WORKSPACE_API_PREFIX])
      expect(app.upgrades).toEqual([WORKSPACE_PTY_STREAM_PATH])
      expect((await app.get(WORKSPACE_CAPABILITIES_PATH)).status).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
  })
})
