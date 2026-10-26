/**
 * The provider mounted the way production mounts every plugin: a real `@deepseek-ai/cordis-plugin-loader` row pointing at the built
 * `lib/index.js`, with a consumer that declares `inject: ['kv']`.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { Kv } from 'acryl-kv'
import type {} from 'acryl-kv/cordis'
import { afterEach, describe, expect, it } from 'vitest'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const FAILED = 3 as FiberState.FAILED
const DISPOSED = 4 as FiberState.DISPOSED
const BUILT_ENTRY = new URL('../lib/index.js', import.meta.url).href

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-kv-json-loader-'))
  roots.push(root)
  writeFileSync(join(root, 'row.mjs'), `export * from ${JSON.stringify(BUILT_ENTRY)}\n`)
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

/** A consumer app plugin: it sees only the port. */
function consumer(ctx: Context): { seen: Kv[], fiber: ReturnType<Context['plugin']> } {
  const seen: Kv[] = []
  const fiber = ctx.plugin({ name: 'settings-app', inject: ['kv'], apply: (inner: Context) => { seen.push(inner.kv) } })
  return { seen, fiber }
}

describe('acryl-kv-json through a real Loader', () => {
  it('keeps a consumer PENDING until the row provides kv, writes the file from the app\'s folder, and serves reads and writes', async () => {
    const root = app()
    const ctx = await loader(root)
    const { seen, fiber } = consumer(ctx)
    await fiber
    expect(fiber.state).toBe(PENDING)

    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'data/kv.json' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await fiber
    expect(fiber.state).toBe(ACTIVE)
    expect(seen).toHaveLength(1)
    await seen[0]!.set('theme', 'dark')
    expect(await ctx.kv.get('theme')).toBe('dark')
    expect('close' in ctx.kv).toBe(false)
    expect(JSON.parse(readFileSync(join(root, 'data', 'kv.json'), 'utf8'))).toEqual({ version: 1, entries: { theme: 'dark' } })
  })

  it('moves the consumer to the new file when the row\'s path changes', async () => {
    const root = app()
    const ctx = await loader(root)
    const { seen } = consumer(ctx)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'one.json' } })
    await ctx.loader.await()
    await ctx.kv.set('file', 'one')

    await entryOf(ctx, entryId).update({ config: { path: 'two.json' } })
    await ctx.loader.await()
    expect(seen).toHaveLength(2)
    expect(seen[1]).not.toBe(seen[0])
    expect(await seen[1]!.get('file')).toBeUndefined()
    await expect(seen[0]!.get('file')).rejects.toThrow()
    expect(JSON.parse(readFileSync(join(root, 'one.json'), 'utf8')).entries).toEqual({ file: 'one' })
  })

  it('keeps the data through ten disable and enable cycles, and leaves no temporary file and nothing open', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'data/kv.json' } })
    await ctx.loader.await()
    for (let i = 0; i < 10; i += 1) {
      await ctx.kv.update<number>('count', current => (current ?? 0) + 1)
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      expect(ctx.get('kv')).toBeUndefined()
      expect(readdirSync(join(root, 'data'))).toEqual(['kv.json'])
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    }
    expect(await ctx.kv.get('count')).toBe(10)
    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    // Nothing holds the file: the folder goes at once (Windows refuses while a handle is open).
    rmSync(join(root, 'data'), { recursive: true })
    expect(existsSync(join(root, 'data'))).toBe(false)
  })

  it('waits for the writes in flight when the row unloads', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'kv.json' } })
    await ctx.loader.await()
    const writes = Array.from({ length: 20 }, (_, index) => ctx.kv.set(`k${String(index).padStart(2, '0')}`, index))
    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    await Promise.all(writes)
    expect(Object.keys(JSON.parse(readFileSync(join(root, 'kv.json'), 'utf8')).entries)).toHaveLength(20)
  })

  it('fails the row, and leaves the file untouched, when it is not a readable kv file', async () => {
    const root = app()
    writeFileSync(join(root, 'kv.json'), '{"version":1,"entries":{"half":')
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'kv.json' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
    expect(ctx.get('kv')).toBeUndefined()
    expect(readFileSync(join(root, 'kv.json'), 'utf8')).toBe('{"version":1,"entries":{"half":')
    expect(readdirSync(root).sort()).toEqual(['kv.json', 'row.mjs'])
  })

  it('defaults to kv.json in the app home from an appInstance service, and ignores one without a string home', async () => {
    const root = app()
    const ctx = await loader(root)
    const home = join(root, 'home')
    mkdirSync(home)
    const withdraw = ctx.reflect.provide('appInstance', { home, dshHome: join(home, '.dsh') })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await ctx.kv.set('here', true)
    expect(existsSync(join(home, 'kv.json'))).toBe(true)
    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    void withdraw()

    const other = await loader(app())
    const withdrawBad = other.reflect.provide('appInstance', { home: 42 })
    const badId = await other.loader.create({ name: './row.mjs' })
    await other.loader.await()
    expect(entryOf(other, badId).fiber?.state).toBe(FAILED)
    void withdrawBad()
  })

  it('declares no type for the appInstance service it does not own', () => {
    const declarations = readFileSync(new URL('../lib/types/index.d.ts', import.meta.url), 'utf8')
    expect(declarations).not.toMatch(/declare module|appInstance\s*:/u)
  })

  it('fails the row when there is neither a path nor an app home', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
  })
})
