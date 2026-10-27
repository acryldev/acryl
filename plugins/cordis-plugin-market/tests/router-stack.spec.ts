/**
 * The Market on the real stack (spec 046, M2 gate): the actual DSH `webServer` listening on a loopback port, the real
 * `acryl-router` and `acryl-router-http` plugins, and this package's own `apply`, with no handler fakes. A browser-shaped
 * `fetch` reaches the ported routes, the peer address travels as connection info, and the plugin unloads and reloads cleanly.
 */

import { Context, type FiberState } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply as routerApply, name as routerName } from 'acrylblends/cordis/router'
import { apply as httpApply, inject as httpInject, name as httpName } from 'acrylblends/cordis/router-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply as marketApply, inject as marketInject, name as marketName } from '../src/index.js'
import { marketRoutes } from '../src/host/routes.js'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await settle(10) }
  throw new Error(`timed out waiting for: ${label}`)
}

/** The settings service the market registers its namespace on, kept in memory. */
function memorySettings() {
  let document: Record<string, unknown> = { sources: [] }
  return {
    register: vi.fn(() => ({
      get: () => document,
      update: async (patch: object) => { document = { ...document, ...patch } },
    })),
  }
}

const market = { name: marketName, inject: marketInject, apply: marketApply }

async function stack(withMarket = true): Promise<{ ctx: Context, base: string, origin: string }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('acrylSettings' as never, memorySettings() as never)
  ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
  ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
  const web = ctx as unknown as { webServer?: { port: number } }
  await until(() => web.webServer?.port !== undefined && (ctx as unknown as { routerHttp?: unknown }).routerHttp !== undefined, 'the stack to start')
  const origin = `http://127.0.0.1:${String(web.webServer!.port)}`
  if (withMarket) ctx.plugin(market)
  await settle(30)
  return { ctx, base: origin, origin }
}

describe('the community Market on the real router stack', () => {
  it('serves the state route over real HTTP from the loopback peer, with the Market\'s own headers', async () => {
    const { base } = await stack()
    const response = await fetch(`${base}${marketRoutes.state}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toMatchObject({ sources: [], desktopActions: { openTerminal: false } })
  })

  it('refuses a cross-site request with the authority check, which reads the socket peer from the adapter', async () => {
    const { base } = await stack()
    const response = await fetch(`${base}${marketRoutes.state}`, { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'market request authority rejected' })
  })

  it('accepts a same-origin source change and refuses a foreign origin and a non-POST, as before', async () => {
    const { base, origin } = await stack()
    const url = `${base}${marketRoutes.sources}`
    const asJson = { 'content-type': 'application/json' }
    expect((await fetch(url, { method: 'GET' })).status).toBe(405)
    expect((await fetch(url, { method: 'POST', headers: { ...asJson, origin: 'http://evil.example' }, body: '{}' })).status).toBe(405)
    const bad = await fetch(url, { method: 'POST', headers: { ...asJson, origin }, body: '{"op":"nope"}' })
    expect(bad.status).toBe(400)
    const oversized = await fetch(url, { method: 'POST', headers: { ...asJson, origin }, body: 'x'.repeat(40_000) }).catch(() => undefined)
    // The oversize body is refused before it is parsed: either a 400 or a closed socket, never a 200.
    expect(oversized === undefined || oversized.status === 400).toBe(true)
  })

  it('stays PENDING without the router and activates when it appears', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('acrylSettings' as never, memorySettings() as never)
    ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
    const fiber = ctx.plugin(market)
    await settle(50)
    expect(fiber.state).toBe(PENDING)
    ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
    ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
    await until(() => fiber.state === ACTIVE, 'the Market to activate')
  })

  it('removes its routes when it unloads and serves them again when it reloads, twenty times', async () => {
    const { ctx, base } = await stack(false)
    const router = (ctx as unknown as { router: { size: number } }).router
    for (let i = 0; i < 20; i += 1) {
      const fiber = ctx.plugin(market)
      await settle(20)
      expect((await fetch(`${base}${marketRoutes.state}`)).status).toBe(200)
      await fiber.dispose()
      await settle(10)
      expect((await fetch(`${base}${marketRoutes.state}`)).status).toBe(404)
      expect(router.size).toBe(0)
    }
  })
})
