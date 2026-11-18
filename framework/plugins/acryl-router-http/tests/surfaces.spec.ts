/**
 * One plugin, two compositions (spec 046, M3): the same `apply` runs in a Web or Desktop composition (the DSH webServer,
 * the router and the HTTP adapter) and in a terminal composition (the router alone, no server at all). The routes are
 * registered once, in `apply`; serving them over HTTP is the optional part, requested through an inner `inject`. The
 * assertions compare what a browser receives with what the terminal's in-process call receives.
 */

import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { Acryl, apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import { apply as httpApply, inject as httpInject, name as httpName } from '../src/index.ts'

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await settle(10) }
  throw new Error(`timed out waiting for: ${label}`)
}

/** A capability as a plugin author writes it: routes in `apply`, HTTP only if an adapter happens to be present. */
const notes = {
  name: 'notes-demo',
  inject: ['router'],
  apply(ctx: Context): void {
    const store = new Map<string, string>()
    const app = new Acryl()
      .post('/:id', async c => {
        const text = await c.req.text()
        store.set(c.req.param('id'), text)
        return c.json({ id: c.req.param('id'), saved: text.length }, 201)
      })
      .get('/:id', c => {
        const text = store.get(c.req.param('id'))
        return text === undefined ? c.json({ error: 'not found' }, 404) : c.json({ id: c.req.param('id'), text })
      })
    ctx.router.route('/api/notes', app)
    ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/api/notes') })
  },
}

/** Web or Desktop: a loopback webServer, the router and the adapter. */
async function webComposition(): Promise<{ ctx: Context, base: string }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 } as never)
  ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
  const web = ctx as unknown as { webServer?: { port: number } }
  await until(() => web.webServer?.port !== undefined && (ctx as unknown as { routerHttp?: unknown }).routerHttp !== undefined, 'the web composition')
  ctx.plugin(notes)
  await settle(30)
  return { ctx, base: `http://127.0.0.1:${String(web.webServer!.port)}` }
}

/** Terminal: the router only. No server, no adapter, nothing listening. */
async function terminalComposition(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  await settle(20)
  ctx.plugin(notes)
  await settle(20)
  return ctx
}

async function snapshot(response: Response): Promise<{ status: number, type: string | null, body: unknown }> {
  return { status: response.status, type: response.headers.get('content-type'), body: await response.json() }
}

describe('the same capability on every surface', () => {
  it('answers a browser over HTTP and the terminal in process with the same status, headers and body', async () => {
    const web = await webComposition()
    const terminal = await terminalComposition()

    const viaHttp = [
      await snapshot(await fetch(`${web.base}/api/notes/a`)),
      await snapshot(await fetch(`${web.base}/api/notes/a`, { method: 'POST', body: 'hello' })),
      await snapshot(await fetch(`${web.base}/api/notes/a`)),
    ]
    const router = (terminal as unknown as { router: { fetch(request: Request): Promise<Response> } }).router
    const inProcess = [
      await snapshot(await router.fetch(new Request('http://acryl.test/api/notes/a'))),
      await snapshot(await router.fetch(new Request('http://acryl.test/api/notes/a', { method: 'POST', body: 'hello' }))),
      await snapshot(await router.fetch(new Request('http://acryl.test/api/notes/a'))),
    ]

    expect(inProcess).toEqual(viaHttp)
    expect(viaHttp.map(step => step.status)).toEqual([404, 201, 200])
  })

  it('opens no socket in the terminal composition: nothing in that context is a server', async () => {
    const terminal = await terminalComposition()
    expect((terminal as unknown as { webServer?: unknown }).webServer).toBeUndefined()
    expect((terminal as unknown as { routerHttp?: unknown }).routerHttp).toBeUndefined()
  })
})
