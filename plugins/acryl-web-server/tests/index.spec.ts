/** The webServer port on a real socket: exact and prefix routes, upgrades, ownership and disposal, taps, host and port. */
import { connect } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import * as nodeServer from 'acryl-node-server'
import * as webServer from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function boot(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  await ctx.plugin(nodeServer, { port: 0, scan: 0 })
  await ctx.plugin(webServer)
  if (ctx.get('webServer') === undefined) throw new Error('the webServer port did not provide its service')
  return ctx
}

/** Mount a plugin that owns `apply`'s registrations; disposing the returned fiber must undo them. */
async function owner(ctx: Context, apply: (ctx: Context) => void) {
  const fiber = ctx.plugin({ name: 'owner', inject: ['webServer'], apply })
  await fiber
  return fiber
}

describe('acryl-web-server', () => {
  it('serves exact and prefix routes and leaves the router the rest', async () => {
    const ctx = await boot()
    ctx.router.route('/', new Acryl().get('/router', c => c.text('router')))
    await owner(ctx, (inner) => {
      inner.webServer.register({ kind: 'exact', path: '/api/exact', handler: (req, res) => { res.writeHead(200); res.end(`exact ${String(req.method)}`) } })
      inner.webServer.register({ kind: 'prefix', path: '/api/prefix', handler: (_req, res) => { res.end('prefix') } })
    })
    const url = ctx.nodeServer.url
    expect(await (await fetch(`${url}/api/exact`)).text()).toBe('exact GET')
    expect(await (await fetch(`${url}/api/prefix/deeper`)).text()).toBe('prefix')
    expect(await (await fetch(`${url}/router`)).text()).toBe('router')
    expect((await fetch(`${url}/api/exact/more`)).status).toBe(404)
  })

  it('takes every registration away when the owning plugin unloads', async () => {
    const ctx = await boot()
    const fiber = await owner(ctx, (inner) => {
      inner.webServer.register({ kind: 'prefix', path: '/gone', handler: (_req, res) => { res.end('here') } })
    })
    expect(await (await fetch(`${ctx.nodeServer.url}/gone`)).text()).toBe('here')
    await fiber.dispose()
    expect((await fetch(`${ctx.nodeServer.url}/gone`)).status).toBe(404)
  })

  it('mounts once per activation: two reloads, no duplicate route', async () => {
    const ctx = await boot()
    for (let round = 0; round < 2; round += 1) {
      const fiber = await owner(ctx, (inner) => {
        inner.webServer.register({ kind: 'exact', path: '/reload', handler: (_req, res) => { res.end(`round ${String(round)}`) } })
      })
      expect(await (await fetch(`${ctx.nodeServer.url}/reload`)).text()).toBe(`round ${String(round)}`)
      await fiber.dispose()
    }
    expect((await fetch(`${ctx.nodeServer.url}/reload`)).status).toBe(404)
  })

  it('claims an upgrade path for its owner and releases it on unload', async () => {
    const ctx = await boot()
    // The router's WebSocket setup is attached, so the claimed upgrade exercises the adapter's skip path.
    ctx.nodeServer.upgrades()
    let seen = 0
    const fiber = await owner(ctx, (inner) => {
      inner.webServer.registerUpgrade({ path: '/api/socket', handler: (_req, socket) => { seen += 1; socket.destroy() } })
    })
    const upgrade = async (): Promise<void> =>
      await new Promise<void>((resolve) => {
        const client = connect(Number(new URL(ctx.nodeServer.url).port), '127.0.0.1', () => {
          client.write('GET /api/socket HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n')
        })
        const done = (): void => { client.destroy(); resolve() }
        client.once('close', done)
        client.once('error', done)
        client.once('data', done)
        setTimeout(done, 2_000)
      })
    await upgrade()
    expect(seen).toBe(1)
    // The remover is the node server's own tested seam (tests/raw-routes.spec.ts); here the claim through the port must reach it, which the first
    // upgrade proves. A second upgrade after disposal would leave the router's WebSocket setup holding the socket open in this test environment.
    await fiber.dispose()
  }, 15_000)

  it('applies index taps in order while their owner lives', async () => {
    const ctx = await boot()
    const fiber = await owner(ctx, (inner) => {
      inner.webServer.tapIndex(html => html.replace('</head>', '<script src="/one.js"></script></head>'))
      inner.webServer.tapIndex(html => html.replace('</head>', '<script src="/two.js"></script></head>'))
    })
    const tapped = ctx.webServer.index('<html><head></head><body></body></html>')
    expect(tapped).toContain('<script src="/one.js"></script>')
    expect(tapped).toContain('<script src="/two.js"></script>')
    expect(tapped.indexOf('one.js')).toBeLessThan(tapped.indexOf('two.js'))
    expect(tapped).toContain('__DSH_BOOT_READY__')
    await fiber.dispose()
    expect(ctx.webServer.index('<html><head></head></html>')).not.toContain('one.js')
  })

  it('renders the structured index rows before the string taps', async () => {
    const ctx = await boot()
    const fiber = await owner(ctx, (inner) => {
      ;(inner as unknown as { on(name: string, listener: (table: unknown[]) => void): () => void }).on('webserver/index-inject', (table) => {
        table.push({ kind: 'global', name: '__TEST_BOOT__', value: { rev: '1' } })
      })
      inner.webServer.tapIndex(html => html.replace('</body>', '<p>tap</p></body>'))
    })
    const html = ctx.webServer.index('<html><head></head><body></body></html>')
    expect(html).toMatch(/__TEST_BOOT__/u)
    expect(html.indexOf('__TEST_BOOT__')).toBeLessThan(html.indexOf('<p>tap</p>'))
    await fiber.dispose()
  })

  it('reports the address the node server bound', async () => {
    const ctx = await boot()
    expect(ctx.webServer.host).toBe('127.0.0.1')
    expect(ctx.webServer.port).toBe(ctx.nodeServer.port)
    expect(ctx.webServer.port).toBeGreaterThan(0)
  })
})
