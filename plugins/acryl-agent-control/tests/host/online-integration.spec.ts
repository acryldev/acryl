/**
 * The online channel wired through the real, built plugin (spec 041 TB30): off by default, on and answering a
 * real HTTP call with the right secret when configured, its secret file gone once the plugin unloads. Mounts
 * the built `lib/index.js` directly (not the TypeScript source: `AuditLog`'s constructor uses a parameter
 * property Node's type-stripping loader cannot parse - the same reason `loader-lifecycle.spec.ts` does this).
 */
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

// A fresh real server per test (not one shared across the file): the plugin's own dispose() only retracts its
// route from this fake webServer's own map, it does not know about the underlying 'request' listener, so
// reusing one server across mounts would leave a stale listener racing the next test's response.
let server: Server | undefined
let port = 0
const roots: string[] = []
afterEach(async () => {
  if (server !== undefined) { await new Promise<void>(resolve => { server?.close(() => { resolve() }) }); server = undefined }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fakeWebServer(this: void) {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()
  server?.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const handler = req.url !== undefined ? routes.get(req.url.split('?')[0] ?? '') : undefined
    if (handler !== undefined) handler(req, res)
    else { res.statusCode = 404; res.end('{}') }
  })
  return {
    host: '127.0.0.1',
    port,
    register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
      routes.set(route.path, route.handler as never)
      return () => { routes.delete(route.path) }
    },
    registerUpgrade: () => () => {},
  }
}

async function mount(config?: unknown): Promise<{ fiber: { dispose(): Promise<void> }; home: string }> {
  server = createServer()
  await new Promise<void>(resolve => { server?.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0

  const home = mkdtempSync(join(tmpdir(), 'acryl-agent-control-online-'))
  roots.push(home)
  const ctx = new Context()
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('acrylWeb' as never, fakeWebServer() as never)
  ctx.provide('tools' as never, { get: () => undefined, register: () => () => {} } as never)
  const module = await import(BUILT_ENTRY) as { apply(ctx: Context, config?: unknown): void }
  const fiber = ctx.plugin({ name: 'acryl-agent-control', inject: ['acrylWeb', 'tools', 'appInstance'], apply: module.apply }, config)
  await new Promise(resolve => { setTimeout(resolve, 0) })
  return { fiber: fiber as unknown as { dispose(): Promise<void> }, home }
}

function call(path: string, body: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const text = JSON.stringify(body)
  const headers: Record<string, string | number> = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

describe('the online channel, on by real config, off by default', () => {
  it('writes no secret and answers nothing at the online path when not configured on', async () => {
    const { fiber, home } = await mount()
    expect(existsSync(join(home, 'agent-control-secret'))).toBe(false)
    const { status } = await call('/api/acryl-agent-control/online/call', { op: 'snapshot' })
    expect(status).toBe(404)
    await fiber.dispose()
  })

  it('writes a private secret and answers a real request with it when configured on, then removes the secret on unload', async () => {
    const { fiber, home } = await mount({ online: true })
    const secretPath = join(home, 'agent-control-secret')
    expect(existsSync(secretPath)).toBe(true)
    const secret = readFileSync(secretPath, 'utf8')
    expect(secret).toMatch(/^[0-9a-f]{48}$/)

    const wrong = await call('/api/acryl-agent-control/online/call', { op: 'snapshot' }, 'not-it')
    expect(wrong.status).toBe(403)

    // No page is connected in this test, so the real channel genuinely has nothing to answer from - the
    // meaningful proof here is that the request got past auth and into the real call path (no-window, not a
    // 403 or a 500), which is everything this integration layer (as opposed to online-route.spec.ts's direct,
    // page-free unit coverage of the route itself) can prove without a real connected window.
    const right = await call('/api/acryl-agent-control/online/call', { op: 'snapshot' }, secret)
    expect(right.status).toBe(200)
    expect(right.json).toMatchObject({ ok: false, code: 'no-window' })

    await fiber.dispose()
    expect(existsSync(secretPath)).toBe(false)
  })
})
