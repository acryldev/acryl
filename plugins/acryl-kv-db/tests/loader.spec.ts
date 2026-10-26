/**
 * The provider mounted the way production mounts every plugin: real `@deepseek-ai/cordis-plugin-loader` rows pointing at the built
 * `lib/index.js` files of `acryl-db-sqlite` (provides `db`) and this package (injects `db`, provides `kv`), with a consumer that declares
 * `inject: ['kv']`.
 * @throws if the packages have not been built: run `pnpm run build` in `acryl-db`, `acryl-db-sqlite`, `acryl-kv` and this package first.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type {} from 'acryl-db/cordis'
import type { Kv } from 'acryl-kv'
import type {} from 'acryl-kv/cordis'
import { afterEach, describe, expect, it } from 'vitest'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const DISPOSED = 4 as FiberState.DISPOSED
const DB_ENTRY = new URL('../../acryl-db-sqlite/lib/index.js', import.meta.url).href
const KV_ENTRY = new URL('../lib/index.js', import.meta.url).href

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-kv-db-loader-'))
  roots.push(root)
  writeFileSync(join(root, 'db-row.mjs'), `export * from ${JSON.stringify(DB_ENTRY)}\n`)
  writeFileSync(join(root, 'kv-row.mjs'), `export * from ${JSON.stringify(KV_ENTRY)}\n`)
  return root
}

async function loader(root: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader, { baseUrl: pathToFileURL(root + sep).href })
  return ctx
}

function entryOf(ctx: Context, entryId: string) {
  const found = [...ctx.loader.entries()].find(candidate => candidate.id === entryId)
  if (found === undefined) throw new Error('entry not found')
  return found
}

function consumer(ctx: Context): { seen: Kv[], fiber: ReturnType<Context['plugin']> } {
  const seen: Kv[] = []
  const fiber = ctx.plugin({ name: 'settings-app', inject: ['kv'], apply: (inner: Context) => { seen.push(inner.kv) } })
  return { seen, fiber }
}

describe('acryl-kv-db through a real Loader', () => {
  it('stays PENDING until a db provider exists, then provides kv to a consumer that was waiting for it', async () => {
    const root = app()
    const ctx = await loader(root)
    const { seen, fiber } = consumer(ctx)
    const kvId = await ctx.loader.create({ name: './kv-row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, kvId).fiber?.state).toBe(PENDING)
    expect(fiber.state).toBe(PENDING)
    expect(ctx.get('kv')).toBeUndefined()

    const dbId = await ctx.loader.create({ name: './db-row.mjs', config: { path: 'data.sqlite' } })
    await ctx.loader.await()
    expect(entryOf(ctx, dbId).fiber?.state).toBe(ACTIVE)
    expect(entryOf(ctx, kvId).fiber?.state).toBe(ACTIVE)
    await fiber
    expect(fiber.state).toBe(ACTIVE)
    expect(seen).toHaveLength(1)
    await seen[0]!.set('theme', 'dark')
    expect(await ctx.kv.get('theme')).toBe('dark')
    expect('close' in ctx.kv).toBe(false)
    // The document is a row of the app's own database.
    expect(await ctx.db.all('SELECT key, value FROM kv')).toEqual([{ key: 'theme', value: '"dark"' }])
  })

  it('withdraws kv with the database, and the data is back when the database returns, ten times', async () => {
    const root = app()
    const ctx = await loader(root)
    const dbId = await ctx.loader.create({ name: './db-row.mjs', config: { path: 'data.sqlite' } })
    const kvId = await ctx.loader.create({ name: './kv-row.mjs' })
    await ctx.loader.await()
    for (let i = 0; i < 10; i += 1) {
      await ctx.kv.update<number>('count', current => (current ?? 0) + 1)
      await entryOf(ctx, dbId).update({ disabled: true })
      await ctx.loader.await()
      expect(ctx.get('db')).toBeUndefined()
      expect(ctx.get('kv')).toBeUndefined()
      expect(entryOf(ctx, kvId).fiber?.state).toBe(PENDING)
      await entryOf(ctx, dbId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, kvId).fiber?.state).toBe(ACTIVE)
    }
    expect(await ctx.kv.get('count')).toBe(10)
  })

  it('unloads cleanly, and leaves the database file free to remove', async () => {
    const root = app()
    const ctx = await loader(root)
    const dbId = await ctx.loader.create({ name: './db-row.mjs', config: { path: 'data.sqlite' } })
    const kvId = await ctx.loader.create({ name: './kv-row.mjs', config: { table: 'app_settings' } })
    await ctx.loader.await()
    await ctx.kv.set('k', 1)
    expect(await ctx.db.all('SELECT key FROM app_settings')).toEqual([{ key: 'k' }])
    await entryOf(ctx, kvId).update({ disabled: true })
    await ctx.loader.await()
    const fiber = entryOf(ctx, kvId).fiber
    expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
    expect(ctx.get('kv')).toBeUndefined()
    expect(ctx.get('db')).toBeDefined()
    await entryOf(ctx, dbId).update({ disabled: true })
    await ctx.loader.await()
    // Nothing holds the file (Windows refuses to remove an open one).
    for (const file of ['data.sqlite', 'data.sqlite-wal', 'data.sqlite-shm']) rmSync(join(root, file), { force: true })
    expect(existsSync(join(root, 'data.sqlite'))).toBe(false)
  })
})
