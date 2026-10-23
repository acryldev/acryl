/**
 * The inspector against real Cordis plugins: what it reports is what Cordis holds, so the tests build a small system and
 * compare the report with what the plugins actually did.
 */

import { Context } from '@deepseek-ai/cordis'
import { App, apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, name, type PluginReport } from '../src/index.ts'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

const market = {
  name: 'demo-market',
  inject: ['router'],
  apply(ctx: Context): void {
    ctx.router.route('/api/demo', new App()
      .use(async (_c, next) => { await next() })
      .get('/state', c => c.json({ ok: true }))
      .post('/sources', c => c.json({ ok: true }, 201)))
  },
}

async function system(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name: routerName, apply: routerApply }, { trailingSlash: 'strict' })
  ctx.plugin({ name, apply })
  await settle()
  return ctx
}

const byName = (reports: readonly PluginReport[], pluginName: string): PluginReport => {
  const found = reports.find(report => report.name === pluginName)
  if (found === undefined) throw new Error(`no report for ${pluginName}`)
  return found
}

describe('acryl-inspect', () => {
  it('counts what an inline ctx.inject callback registers as the owning plugin\'s', async () => {
    const ctx = await system()
    ctx.plugin({
      name: 'demo-inline',
      apply(inner: Context): void {
        inner.inject(['router'], deeper => { deeper.router.route('/', new App().get('/api/inline', c => c.json({ ok: true }))) })
      },
    })
    await settle()
    const reports = ctx.inspect.plugins()
    expect(byName(reports, 'demo-inline').routes).toEqual([{ method: 'GET', path: '/api/inline' }])
    expect(reports.every(report => report.name !== 'anonymous')).toBe(true)
  })

  it('reports what a plugin requires, provides and registers, from the running system', async () => {
    const ctx = await system()
    ctx.plugin(market)
    await settle()
    const reports = ctx.inspect.plugins()

    expect(byName(reports, 'acryl-router')).toMatchObject({ state: 'ACTIVE', requires: [], provides: ['router'] })
    expect(byName(reports, 'acryl-inspect')).toMatchObject({ state: 'ACTIVE', provides: ['inspect'] })
    const demo = byName(reports, 'demo-market')
    expect(demo).toMatchObject({
      state: 'ACTIVE',
      requires: ['router'],
      provides: [],
      mounts: ['/api/demo'],
      routes: [{ method: 'ALL', path: '/api/demo/*' }, { method: 'GET', path: '/api/demo/state' }, { method: 'POST', path: '/api/demo/sources' }],
      removedOnUnload: 1,
    })
  })

  it('shows a plugin whose service is missing as PENDING and says what it waits for', async () => {
    const ctx = await system()
    ctx.plugin({ name: 'needs-a-thing', inject: ['neverProvided'], apply() { /* never runs */ } })
    await settle()
    expect(byName(ctx.inspect.plugins(), 'needs-a-thing')).toMatchObject({ state: 'PENDING', requires: ['neverProvided'] })
    expect(ctx.inspect.explain('needs-a-thing')).toContain('it starts when neverProvided is available')
  })

  it('stops listing a plugin that unloaded, and the router really lost what the report said would go', async () => {
    const ctx = await system()
    const baseline = ctx.router.size
    const fiber = ctx.plugin(market)
    await settle()
    const promised = byName(ctx.inspect.plugins(), 'demo-market').removedOnUnload
    expect(ctx.router.size - baseline).toBe(promised)

    await fiber.dispose()
    await settle()
    expect(ctx.inspect.plugins().some(report => report.name === 'demo-market' && report.state === 'ACTIVE')).toBe(false)
    expect(ctx.router.size).toBe(baseline)
  })

  it('serves the same facts on the router, in process', async () => {
    const ctx = await system()
    ctx.plugin(market)
    await settle()
    const list = await ctx.router.fetch(new Request('http://acryl.test/api/inspect/plugins'))
    expect(list.status).toBe(200)
    const reports = await list.json() as PluginReport[]
    expect(byName(reports, 'demo-market').routes).toHaveLength(3)

    const one = await ctx.router.fetch(new Request('http://acryl.test/api/inspect/plugins/demo-market'))
    expect(await one.text()).toContain('removes 1 registration and nothing else')
    expect((await ctx.router.fetch(new Request('http://acryl.test/api/inspect/plugins/nope'))).status).toBe(404)
  })

  it('needs no router: without one it still answers in code and registers no routes', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.plugin({ name, apply })
    await settle()
    expect(byName(ctx.inspect.plugins(), 'acryl-inspect').routes).toEqual([])
    expect(ctx.inspect.render()).toContain('acryl-inspect (ACTIVE)')
  })
})
