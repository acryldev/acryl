import { Context } from '@deepseek-ai/cordis'
import { apply as routerApply, name as routerName } from 'acrylblends/cordis/router'
import { apply as stateApply, name as stateName } from 'acrylblends/cordis/state'
import { afterEach, describe, expect, it } from 'vitest'
import * as starter from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

async function system(): Promise<{ ctx: Context, fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name: routerName, apply: routerApply })
  ctx.plugin({ name: stateName, apply: stateApply })
  const fiber = ctx.plugin(starter)
  await settle()
  return { ctx, fiber }
}

describe('acryl-framework-starter', () => {
  it('answers a request in process and counts visits in a cell', async () => {
    const { ctx } = await system()
    const first = await ctx.router.request('/api/starter/hello/world')
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ hello: 'world', visits: 1 })
    expect(await (await ctx.router.request('/api/starter/hello/again')).json()).toEqual({ hello: 'again', visits: 2 })
  })

  it('removes its route when it unloads', async () => {
    const { ctx, fiber } = await system()
    const before = ctx.router.size
    expect(before).toBeGreaterThan(0)
    await fiber.dispose()
    expect((await ctx.router.request('/api/starter/hello/x')).status).toBe(404)
  })
})
