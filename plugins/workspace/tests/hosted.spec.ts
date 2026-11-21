/**
 * The workspace's Host half in a hosted app: the Web server listens beyond loopback (`acrylWeb.host` is `0.0.0.0`, as a WebBox's frame does) and the app
 * has a trusted front (`ACRYL_PUBLIC_ORIGIN`, `ACRYL_TRUSTED_PROXY`). The plugin then activates, and every route and the terminal's socket answer only the
 * front's public address (or loopback); the test's own peer, 127.0.0.1, plays the front. The front is read from the environment once per process, so
 * this file sets it before the plugin loads. Without a front the same server is refused (`plugin.spec.ts`).
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import * as settingsPlugin from '@acryldev/settings'
import { apply as applyRouter, name as routerName } from '@acryldev/blends/cordis/router'
import * as routerHttpPlugin from '@acryldev/blends/cordis/router-http'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { WORKSPACE_CAPABILITIES_PATH } from '../src/capabilities/contract.ts'
import { WORKSPACE_PTY_PATH, WORKSPACE_PTY_STREAM_PATH } from '../src/pty/contract.ts'

vi.hoisted(() => {
  process.env.ACRYL_PUBLIC_ORIGIN = 'https://box.example.com'
  process.env.ACRYL_TRUSTED_PROXY = '127.0.0.1'
})
const workspace = await import('../src/index.ts')

const ACTIVE = 2 as FiberState.ACTIVE
const PUBLIC = 'https://box.example.com'

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})
const shell = process.env.SHELL
beforeAll(() => { process.env.SHELL = '/bin/sh' })
afterAll(() => { if (shell === undefined) delete process.env.SHELL; else process.env.SHELL = shell })

/** A `webServer` on a real loopback socket with the Host's rules (longest prefix; an upgrade by its exact path, refused otherwise) and its `acrylWeb` address. */
async function host() {
  const prefixes = new Map<string, Handler>()
  const exact: string[] = []
  const upgradeRoutes = new Map<string, UpgradeHandler>()
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const match = [...prefixes.keys()].filter(prefix => path === prefix || path.startsWith(`${prefix}/`)).sort((a, b) => b.length - a.length)[0]
    if (match === undefined) { res.statusCode = 404; res.end(); return }
    void prefixes.get(match)?.(req, res)
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const handler = upgradeRoutes.get(new URL(req.url ?? '/', 'http://x').pathname)
    if (handler === undefined) { socket.destroy(); return }
    void handler(req, socket, head)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }))
  const webServer = {
    host: '127.0.0.1',
    port,
    register: (route: { kind: 'exact' | 'prefix', path: string, handler: Handler }) => {
      if (route.kind === 'exact') { exact.push(route.path); return () => { exact.splice(exact.indexOf(route.path), 1) } }
      if (prefixes.has(route.path)) throw new Error(`duplicate prefix ${route.path}`)
      prefixes.set(route.path, route.handler)
      return () => { prefixes.delete(route.path) }
    },
    registerUpgrade: (route: { path: string, handler: UpgradeHandler }) => {
      if (upgradeRoutes.has(route.path)) throw new Error(`duplicate upgrade ${route.path}`)
      upgradeRoutes.set(route.path, route.handler)
      return () => { upgradeRoutes.delete(route.path) }
    },
  }
  const acrylWeb = { host: '0.0.0.0', port }
  const upgrades = (): string[] => [...upgradeRoutes.keys()]
  return { port, origin: `http://127.0.0.1:${String(port)}`, prefixes, exact, upgrades, webServer, acrylWeb }
}


async function boot() {
  const served = await host()
  const home = mkdtempSync(join(tmpdir(), 'acryl-workspace-hosted-'))
  cleanups.push(() => { rmSync(home, { recursive: true, force: true }) })
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('webServer' as never, served.webServer as never)
  ctx.provide('acrylWeb' as never, served.acrylWeb as never)
  await ctx.plugin(settingsPlugin as never, { filename: '' } as never)
  const http = ctx.plugin(routerHttpPlugin)
  const fiber = ctx.plugin(workspace)
  await ctx.plugin({ name: routerName, apply: applyRouter })
  await http
  await fiber
  /** A request as the front passes it on: the public `Host`, and the page's own `Origin`. */
  const send = (path: string, options: { method?: string, headers?: Record<string, string>, body?: unknown } = {}) =>
    new Promise<{ status: number, body: string }>((resolve, reject) => {
      const headers = { host: 'box.example.com', origin: PUBLIC, 'sec-fetch-site': 'same-origin', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers }
      const req = request({ host: '127.0.0.1', port: served.port, path, method: options.method ?? 'GET', headers }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body }) })
      })
      req.on('error', reject)
      req.end(options.body === undefined ? undefined : JSON.stringify(options.body))
    })
  return { ...served, fiber, send }
}

describe('the workspace Host plugin behind a trusted front', () => {
  it('activates on a server beyond loopback and answers the front\'s public address', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect(await app.send(WORKSPACE_CAPABILITIES_PATH)).toEqual({ status: 200, body: JSON.stringify({ chat: false }) })
  })

  it('refuses a request that is neither the front\'s public address nor loopback', async () => {
    const app = await boot()
    expect((await app.send(WORKSPACE_CAPABILITIES_PATH, { headers: { host: 'other.example.com', origin: 'https://other.example.com' } })).status).toBe(403)
    expect((await app.send(WORKSPACE_CAPABILITIES_PATH, { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await app.send(WORKSPACE_PTY_PATH, { method: 'POST', body: { commandId: 'shell' }, headers: { origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('runs a real terminal through the public address: started over HTTP, its socket upgraded under the public Origin', async () => {
    const app = await boot()
    const started = await app.send(WORKSPACE_PTY_PATH, { method: 'POST', body: { commandId: 'shell' } })
    expect(started.status).toBe(200)
    const { id } = JSON.parse(started.body) as { id: string }
    const open = (origin: string, hostHeader: string) => new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(app.port)}${WORKSPACE_PTY_STREAM_PATH}?id=${id}&since=0`, { headers: { origin, host: hostHeader } })
      ws.once('open', () => { ws.close(); resolve(101) })
      ws.once('unexpected-response', (_req, res) => { resolve(res.statusCode ?? 0) })
      ws.once('error', () => { resolve(0) })
    })
    expect(await open(PUBLIC, 'box.example.com')).toBe(101)
    expect(await open('https://evil.example', 'box.example.com')).toBe(403)
    expect(await open('https://other.example.com', 'other.example.com')).toBe(403)
  })
})
