/**
 * The online channel wired through the real, built plugin (spec 041 TB30): off by default, on and answering a
 * real HTTP call with the right secret when configured, its secret file gone once the plugin unloads. Mounts
 * the built `lib/index.js` directly (not the TypeScript source: `AuditLog`'s constructor uses a parameter
 * property Node's type-stripping loader cannot parse - the same reason `loader-lifecycle.spec.ts` does this).
 */
import { request } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { provideHost, testHost, type TestHost } from './test-host.ts'

const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

// A fresh Host per test: each mount gets its own socket, so one test's answers never race the next one's.
let host: TestHost | undefined
let port = 0
const roots: string[] = []
afterEach(async () => {
  await host?.close()
  host = undefined
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function mount(config?: unknown): Promise<{ fiber: { dispose(): Promise<void> }; home: string }> {
  host = await testHost()
  port = host.port

  const home = mkdtempSync(join(tmpdir(), 'acryl-agent-control-online-'))
  roots.push(home)
  const ctx = new Context()
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  provideHost(ctx, host)
  ctx.provide('acrylTools' as never, { get: () => undefined, register: () => () => {}, policy: () => () => {} } as never)
  const module = await import(BUILT_ENTRY) as { apply(ctx: Context, config?: unknown): void }
  const fiber = ctx.plugin({ name: 'acryl-agent-control', inject: ['acrylWeb', 'acrylTools', 'appInstance', 'router', 'routerHttp'], apply: module.apply }, config)
  await new Promise(resolve => { setTimeout(resolve, 10) })
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
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: (res.headers['content-type']?.startsWith('application/json') === true ? JSON.parse(out) : {}) as Record<string, unknown> }) })
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
