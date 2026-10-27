/**
 * The Host as the plugin meets it, on a real loopback socket: a `webServer` with the Host's rule for prefix claims (exact path or below it,
 * longest first), which the real `routerHttp` adapter claims the plugin's prefix on, and an `acrylWeb` that records exact routes and serves
 * WebSocket upgrades. Counts every registration and release, so a test can prove one mount per activation and nothing left behind.
 * {@link serveApi} serves route apps alone, composed as the plugin composes them, for the route tests.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import { type Acryl } from 'acrylblends'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { privateApi } from '../../src/host/http.ts'

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

export interface HostCounts {
  /** Prefixes claimed on `webServer` right now. */
  readonly prefixes: readonly string[]
  /** Exact routes registered on `acrylWeb` right now. */
  readonly exact: readonly string[]
  /** Upgrade paths registered on `acrylWeb` right now. */
  readonly upgrades: readonly string[]
  readonly prefixCalls: number
  readonly exactCalls: number
  readonly upgradeCalls: number
  readonly releaseCalls: number
}

export interface TestHost {
  readonly port: number
  /** The Host's own origin, the `Origin` the app's page sends. */
  readonly origin: string
  readonly webServer: object
  readonly acrylWeb: object
  counts(): HostCounts
  close(): Promise<void>
}

export async function testHost(): Promise<TestHost> {
  const prefixes = new Map<string, Handler>()
  const exact = new Map<string, Handler>()
  const upgrades = new Map<string, UpgradeHandler>()
  let prefixCalls = 0
  let exactCalls = 0
  let upgradeCalls = 0
  let releaseCalls = 0
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const handler = exact.get(path) ?? prefixes.get([...prefixes.keys()].filter(prefix => path === prefix || path.startsWith(`${prefix}/`)).sort((a, b) => b.length - a.length)[0] ?? '')
    if (handler === undefined) { res.statusCode = 404; res.end(); return }
    void handler(req, res)
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const handler = upgrades.get(new URL(req.url ?? '/', 'http://x').pathname)
    if (handler === undefined) { socket.destroy(); return }
    handler(req, socket, head)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const claim = <T>(table: Map<string, T>, path: string, handler: T): () => void => {
    if (table.has(path)) throw new Error(`duplicate route ${path}`)
    table.set(path, handler)
    return () => { releaseCalls += 1; table.delete(path) }
  }
  return {
    port,
    origin: `http://127.0.0.1:${String(port)}`,
    webServer: {
      register: (route: { kind: 'prefix'; path: string; handler: Handler }) => { prefixCalls += 1; return claim(prefixes, route.path, route.handler) },
    },
    acrylWeb: {
      host: '127.0.0.1',
      port,
      register: (route: { path: string; handler: Handler }) => { exactCalls += 1; return claim(exact, route.path, route.handler) },
      registerUpgrade: (route: { path: string; handler: UpgradeHandler }) => { upgradeCalls += 1; return claim(upgrades, route.path, route.handler) },
    },
    counts: () => ({
      prefixes: [...prefixes.keys()],
      exact: [...exact.keys()],
      upgrades: [...upgrades.keys()],
      prefixCalls,
      exactCalls,
      upgradeCalls,
      releaseCalls,
    }),
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }),
  }
}

/** Provide the host's `webServer` and `acrylWeb`, and load the real `router` and `routerHttp` plugins on `ctx`, as the app's rows do. */
export function provideHost(ctx: Context, host: TestHost, options: { router?: boolean } = {}): { router(): void } {
  ctx.provide('webServer' as never, host.webServer as never)
  ctx.provide('acrylWeb' as never, host.acrylWeb as never)
  const router = (): void => { ctx.plugin({ name: routerName, apply: applyRouter }) }
  if (options.router !== false) router()
  ctx.plugin(routerHttpPlugin)
  return { router }
}

/** Route apps composed by `privateApi`, as the plugin composes them, behind the real HTTP adapter on a loopback socket: a test sees the peer and port a caller does. */
export async function serveApi(...routes: readonly Acryl[]): Promise<{ readonly port: number; close(): Promise<void> }> {
  const app = privateApi(...routes)
  const server: Server = createServer((req, res) => {
    void routerHttpPlugin.serve({ fetch: (request, connection) => Promise.resolve(app.fetch(request, { connection: connection ?? {} })) }, req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as { port: number }).port,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }),
  }
}
