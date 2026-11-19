/**
 * A whole-root dispose on the frame's own composition (the router, our node server, the webServer port over it, and the router-http adapter): a request
 * in flight finishes with its full body, a mounted WebSocket gets its 1001 close frame, and disposal takes the grace, not more.
 */

import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply as routerApply, name as routerName } from 'acryl-router'
import { apply as httpApply, inject as httpInject, name as httpName } from 'acryl-router-http'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as nodeServer from 'acryl-node-server'
import * as webServer from '../src/index.ts'

const contexts: Context[] = []
const settle = (ms = 0): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function frame(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  await ctx.plugin(nodeServer, { port: 0, scan: 0 })
  await ctx.plugin(webServer)
  ctx.plugin({ name: httpName, inject: httpInject, apply: httpApply })
  const probe = ctx as unknown as { routerHttp?: unknown }
  for (let i = 0; i < 300 && probe.routerHttp === undefined; i += 1) await settle(10)
  if (probe.routerHttp === undefined) throw new Error('routerHttp did not provide its service')
  return ctx
}

describe('stopping the frame', () => {
  it('lets an in-flight request finish and closes a mounted socket with 1001, inside the grace', async () => {
    const ctx = await frame()
    const seen: number[] = []
    let began: () => void = () => {}
    const started = new Promise<void>(resolve => { began = resolve })
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    ctx.router.route('/', new Acryl().get('/save', async (c) => {
      began()
      await gate
      return c.json({ saved: true })
    }))
    ctx.plugin({
      name: 'terminal-owner',
      inject: ['router', 'routerHttp'],
      apply(inner: Context) {
        const upgrade = inner.routerHttp.upgrades()
        inner.router.route('/api/term', new Acryl().get('/stream', upgrade(() => ({
          onClose(event) { seen.push(event.code) },
        }))))
        inner.routerHttp.mount('/api/term', { upgrade: ['/api/term/stream'] })
      },
    })
    await settle(80)
    const port = ctx.nodeServer.port
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/api/term/stream`)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => { resolve() })
      ws.once('error', reject)
    })
    const closed = new Promise<number>(resolve => { ws.once('close', code => { resolve(code) }) })
    const response = fetch(`${ctx.nodeServer.url}/save`)
    await started
    const startedAt = Date.now()
    const disposal = ctx.fiber.dispose()
    // The stop has begun while both are open: the request finishes (it is written, not cut) and the socket gets its close frame.
    await settle(100)
    release()
    const answered = await response
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ saved: true })
    await disposal
    contexts.splice(contexts.indexOf(ctx), 1)
    expect(await closed).toBe(1001)
    expect(seen).toEqual([1001])
    expect(Date.now() - startedAt).toBeLessThan(2_000 + 300)
  })
})
