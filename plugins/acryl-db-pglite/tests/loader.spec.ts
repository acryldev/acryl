/**
 * The provider mounted the way production mounts every plugin: a real `@deepseek-ai/cordis-plugin-loader` row pointing at the built
 * `lib/index.js`, with a consumer that declares `inject: ['db']`.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { Db } from 'acryl-db'
import type {} from 'acryl-db/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCK_FILE } from '../src/folder-lock.ts'

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
  const root = mkdtempSync(join(tmpdir(), 'acryl-db-pglite-loader-'))
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

describe('acryl-db-pglite through a real Loader', () => {
  it('keeps a consumer PENDING until the row provides db, migrates from the app\'s folder, and serves queries', async () => {
    const root = app()
    mkdirSync(join(root, 'migrations'))
    writeFileSync(join(root, 'migrations', '001-notes.sql'), 'CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL);\n')
    const ctx = await loader(root)
    const seen: Db[] = []
    const fiber = ctx.plugin({ name: 'notes-app', inject: ['db'], apply: (inner: Context) => { seen.push(inner.db) } })
    await fiber
    expect(fiber.state).toBe(PENDING)

    const entryId = await ctx.loader.create({ name: './row.mjs', config: { dataDir: 'data/pglite', migrations: 'migrations' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await fiber
    expect(fiber.state).toBe(ACTIVE)
    expect(await seen[0]!.get('INSERT INTO notes (body) VALUES (?) RETURNING id', 'first')).toEqual({ id: 1 })
    expect('close' in ctx.db).toBe(false)
    expect(existsSync(join(root, 'data', 'pglite', 'PG_VERSION'))).toBe(true)
  })

  it('closes PGlite and releases the folder on unload, and reopens it with its data on reload, five times', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { dataDir: 'pglite' } })
    await ctx.loader.await()
    await ctx.db.exec('CREATE TABLE counter (n INTEGER)')
    for (let i = 0; i < 5; i += 1) {
      await ctx.db.run('INSERT INTO counter (n) VALUES (?)', i)
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      expect(ctx.get('db')).toBeUndefined()
      expect(existsSync(join(root, 'pglite', LOCK_FILE))).toBe(false)
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    }
    expect(await ctx.db.all('SELECT n FROM counter ORDER BY n')).toEqual(Array.from({ length: 5 }, (_, n) => ({ n })))
  })

  it('defaults to pglite in the app home from an appInstance service', async () => {
    const root = app()
    const ctx = await loader(root)
    const home = join(root, 'home')
    const withdraw = ctx.reflect.provide('appInstance', { home })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await ctx.db.exec('CREATE TABLE here (n INTEGER)')
    expect(existsSync(join(home, 'pglite', 'PG_VERSION'))).toBe(true)
    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    void withdraw()
  })

  it('fails a second row on the same folder, and leaves the first one serving', async () => {
    const root = app()
    const ctx = await loader(root)
    const first = await ctx.loader.create({ name: './row.mjs', config: { dataDir: 'pglite' } })
    await ctx.loader.await()
    const second = await ctx.loader.create({ name: './row.mjs', config: { dataDir: 'pglite' } })
    await ctx.loader.await()
    expect(entryOf(ctx, first).fiber?.state).toBe(ACTIVE)
    expect(entryOf(ctx, second).fiber?.state).toBe(FAILED)
    expect(await ctx.db.get('SELECT 1 AS one')).toEqual({ one: 1 })
  })

  it('declares no type for the appInstance service it does not own', () => {
    const declarations = readFileSync(new URL('../lib/types/index.d.ts', import.meta.url), 'utf8')
    expect(declarations).not.toMatch(/declare module|appInstance\s*:/u)
  })

  it('fails the row when there is neither a dataDir nor an app home', async () => {
    const ctx = await loader(app())
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
    expect(ctx.get('db')).toBeUndefined()
  })
})
