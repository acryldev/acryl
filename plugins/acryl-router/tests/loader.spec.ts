/**
 * The router mounted the way production mounts every plugin: a real `@deepseek-ai/cordis-plugin-loader` Loader row
 * pointing at the built `lib/index.js`. Covers what a hand-built `ctx.plugin` cannot: the row id equals the package
 * name, the `cordis.patch.yml` insert is loadable, and disabling and enabling the row ten times leaves nothing behind.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/index.ts'

const ACTIVE = 2 as FiberState.ACTIVE
const DISPOSED = 4 as FiberState.DISPOSED
const BUILT_ENTRY = new URL('../lib/index.js', import.meta.url).href

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function mount(): Promise<{ ctx: Context, entryId: string }> {
  const root = mkdtempSync(join(tmpdir(), 'acryl-router-loader-'))
  roots.push(root)
  writeFileSync(join(root, 'row.mjs'), `export * from ${JSON.stringify(BUILT_ENTRY)}\n`)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const entryId = await ctx.loader.create({ name: './row.mjs' })
  await ctx.loader.await()
  return { ctx, entryId }
}

function entryOf(ctx: Context, entryId: string) {
  const found = [...ctx.loader.entries()].find(candidate => candidate.id === entryId)
  if (found === undefined) throw new Error('entry not found')
  return found
}

describe('acryl-router through a real Loader', () => {
  it('activates from the built entry and serves a request in process', async () => {
    const { ctx, entryId } = await mount()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    ctx.router.route('/', new App().get('/ping', c => c.json({ ok: true })))
    const response = await ctx.router.fetch(new Request('http://acryl.test/ping'))
    expect(await response.json()).toEqual({ ok: true })
  })

  it('answers 503 and drops its routes when the row is disabled, and serves again when re-enabled, ten times', async () => {
    const { ctx, entryId } = await mount()
    const first = ctx.router
    for (let i = 0; i < 10; i += 1) {
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    }
    expect(ctx.router).not.toBe(first)
    expect(ctx.router.size).toBe(0)
    expect((await first.fetch(new Request('http://acryl.test/x'))).status).toBe(503)
    ctx.router.route('/', new App().get('/again', c => c.text('ok')))
    expect(await (await ctx.router.fetch(new Request('http://acryl.test/again'))).text()).toBe('ok')
  })
})
