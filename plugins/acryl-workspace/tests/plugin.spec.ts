/**
 * The workspace's Host half activated as the app activates it: real Cordis, the real `router` and `routerHttp` services over a `webServer`
 * that listens on loopback and dispatches upgrades by exact path as DSH's does, the real settings service, and a real terminal. Covers what the
 * route tests cannot: one prefix mount and one upgrade path, PENDING without a router, a live terminal over the router's WebSocket, the mount
 * and the sockets leaving with the plugin, and a reload without duplicates.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import * as settingsPlugin from 'acryl-settings'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import * as routerHttpPlugin from 'acrylblends/cordis/router-http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { WORKSPACE_CAPABILITIES_PATH } from '../src/capabilities/contract.ts'
import * as workspace from '../src/index.ts'
import { WORKSPACE_API_PREFIX } from '../src/private-route.ts'
import { WORKSPACE_PTY_PATH, WORKSPACE_PTY_STREAM_PATH, parsePtyServerMessage, type PtyServerMessage } from '../src/pty/contract.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

// The PTY registry asks the login shell for PATH in the background (about a second with an interactive zsh); a plain sh keeps the
// processes these tests leave behind about routing, not the developer's shell start-up.
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
  const acrylWeb = { host: '127.0.0.1', port }
  const upgrades = (): string[] => [...upgradeRoutes.keys()]
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
  const post = (path: string, body: unknown) =>
    new Promise<{ status: number, body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: served.port, path, method: 'POST', headers: { origin: served.origin, 'content-type': 'application/json' } }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, body: text }) })
      })
      req.on('error', reject)
      req.end(JSON.stringify(body))
    })
  return { ...served, ctx, fiber, router, get, post }
}

/** A terminal view's socket on the app's own page, with what the Host sent and how the socket closed. */
function terminal(app: { port: number, origin: string }, query: string, origin = app.origin) {
  const ws = new WebSocket(`ws://127.0.0.1:${String(app.port)}${WORKSPACE_PTY_STREAM_PATH}?${query}`, { headers: { origin } })
  const messages: PtyServerMessage[] = []
  ws.on('message', (raw: Buffer) => { messages.push(parsePtyServerMessage(raw.toString('utf8'))) })
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => { resolve() })
    ws.once('unexpected-response', (_req, res) => { reject(new Error(`HTTP ${String(res.statusCode)}`)) })
    ws.once('error', reject)
  })
  const closed = new Promise<number>(resolve => ws.once('close', (code: number) => { resolve(code) }))
  const output = (): string => plain(messages.map(m => (m.t === 'out' ? m.data : '')).join(''))
  return { ws, messages, opened, closed, output }
}

/**
 * What a terminal shows, without colors, cursor moves and carriage returns (ConPTY on Windows redraws a line with them).
 */
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex -- the escapes a terminal sends are control bytes.
  return text.replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B[@-_]|\r/gu, '')
}

/**
 * A line that makes the shell print `ACRYL_MARK_<n>`, written so the typed line itself does not contain the mark: seeing it proves the
 * shell ran the command, not just that the keystrokes were echoed. The terminal's shell is `cmd.exe` on Windows and a POSIX shell
 * elsewhere, so the mark is split with the one escape each of them removes.
 */
function printMark(n: number): string {
  return process.platform === 'win32' ? `echo ACRYL_MARK^_${String(n)}\r` : `echo ACRYL_MARK"_"${String(n)}\r`
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('timed out waiting')
}

describe('the workspace Host plugin', () => {
  it('serves every route through one router mount: no exact webServer routes, the terminal stream its only upgrade', async () => {
    const app = await boot()
    expect(app.fiber.state).toBe(ACTIVE)
    expect([...app.prefixes.keys()]).toEqual([WORKSPACE_API_PREFIX])
    expect(app.exact).toEqual([])
    expect(app.upgrades()).toEqual([WORKSPACE_PTY_STREAM_PATH])
    expect(await app.get(WORKSPACE_CAPABILITIES_PATH)).toEqual({ status: 200, body: JSON.stringify({ chat: false }) })
  })

  it('runs a real terminal over the router\'s WebSocket: output down, keystrokes up, and a reconnect resumes from its cursor', async () => {
    const app = await boot()
    const started = await app.post(WORKSPACE_PTY_PATH, { commandId: 'shell' })
    expect(started.status).toBe(200)
    const { id } = JSON.parse(started.body) as { id: string }
    const first = terminal(app, `id=${id}&since=0`)
    await first.opened
    first.ws.send(JSON.stringify({ t: 'in', data: printMark(1) }))
    await until(() => first.output().includes('ACRYL_MARK_1'))
    const cursor = Math.max(...first.messages.map(m => (m.t === 'out' ? m.cursor : 0)))
    first.ws.close()
    expect(await first.closed).toBe(1005)
    // A reconnect from the cursor gets only what came after it, then the live output again.
    const second = terminal(app, `id=${id}&since=${String(cursor)}`)
    await second.opened
    second.ws.send(JSON.stringify({ t: 'in', data: printMark(2) }))
    await until(() => second.output().includes('ACRYL_MARK_2'))
    expect(second.output()).not.toContain('ACRYL_MARK_1')
    expect(second.messages.every(m => m.t !== 'out' || !m.replace)).toBe(true)
    second.ws.close()
    await second.closed
  })

  it('refuses a socket from another page, without an id, or for an unknown session', async () => {
    const app = await boot()
    await expect(terminal(app, 'id=x&since=0', 'http://evil.test').opened).rejects.toThrow('HTTP 403')
    await expect(terminal(app, 'since=0').opened).rejects.toThrow('HTTP 400')
    const unknown = terminal(app, 'id=nope&since=0')
    await unknown.opened
    expect(await unknown.closed).toBe(4404)
  })

  it('closes its open terminals with 1001 when it unloads', async () => {
    const app = await boot()
    const { id } = JSON.parse((await app.post(WORKSPACE_PTY_PATH, { commandId: 'shell' })).body) as { id: string }
    const view = terminal(app, `id=${id}&since=0`)
    await view.opened
    await app.fiber.dispose()
    expect(await view.closed).toBe(1001)
    expect(app.upgrades()).toEqual([])
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
    expect(app.upgrades()).toEqual([])
    expect((await app.get(WORKSPACE_CAPABILITIES_PATH)).status).toBe(404)
    for (let i = 0; i < 3; i += 1) {
      const again = app.ctx.plugin(workspace)
      await again
      expect(again.state).toBe(ACTIVE)
      expect([...app.prefixes.keys()]).toEqual([WORKSPACE_API_PREFIX])
      expect(app.upgrades()).toEqual([WORKSPACE_PTY_STREAM_PATH])
      expect((await app.get(WORKSPACE_CAPABILITIES_PATH)).status).toBe(200)
      await again.dispose()
    }
    expect(app.prefixes.size).toBe(0)
  })
})
