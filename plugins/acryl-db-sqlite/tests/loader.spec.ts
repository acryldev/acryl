/**
 * The provider mounted the way production mounts every plugin: a real `@deepseek-ai/cordis-plugin-loader` row pointing at the built
 * `lib/index.js`, with a consumer that declares `inject: ['db']`.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { Db } from 'acryl-db'
import { afterEach, describe, expect, it } from 'vitest'
import { openNodeSqliteDatabase } from '../src/index.ts'

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
  const root = mkdtempSync(join(tmpdir(), 'acryl-db-sqlite-loader-'))
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
function consumer(ctx: Context): { seen: Db[], fiber: ReturnType<Context['plugin']> } {
  const seen: Db[] = []
  const fiber = ctx.plugin({ name: 'notes-app', inject: ['db'], apply: (inner: Context) => { seen.push(inner.db) } })
  return { seen, fiber }
}

describe('acryl-db-sqlite through a real Loader', () => {
  it('keeps a consumer PENDING until the row provides db, migrates the file from the app\'s folder, and serves queries', async () => {
    const root = app()
    mkdirSync(join(root, 'migrations'))
    writeFileSync(join(root, 'migrations', '001-notes.sql'), 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\n')
    const ctx = await loader(root)
    const { seen, fiber } = consumer(ctx)
    await fiber
    expect(fiber.state).toBe(PENDING)

    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'data/app.sqlite', migrations: 'migrations' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await fiber
    expect(fiber.state).toBe(ACTIVE)
    expect(seen).toHaveLength(1)
    await seen[0]!.run('INSERT INTO notes (body) VALUES (?)', 'first')
    expect(await ctx.db.all('SELECT body FROM notes')).toEqual([{ body: 'first' }])
    expect('close' in ctx.db).toBe(false)
    expect(existsSync(join(root, 'data', 'app.sqlite'))).toBe(true)
  })

  it('moves the consumer to the new file when the row\'s path changes', async () => {
    const root = app()
    const ctx = await loader(root)
    const { seen } = consumer(ctx)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'one.sqlite' } })
    await ctx.loader.await()
    await ctx.db.exec('CREATE TABLE marker (file TEXT); INSERT INTO marker VALUES (\'one\')')

    await entryOf(ctx, entryId).update({ config: { path: 'two.sqlite' } })
    await ctx.loader.await()
    expect(seen).toHaveLength(2)
    expect(seen[1]).not.toBe(seen[0])
    await expect(seen[1]!.all('SELECT file FROM marker')).rejects.toThrow()
    await expect(seen[0]!.all('SELECT file FROM marker')).rejects.toThrow()
  })

  it('closes the file on unload, so it reopens with its data and an empty WAL, ten times', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'data.sqlite' } })
    await ctx.loader.await()
    await ctx.db.exec('CREATE TABLE counter (n INTEGER)')
    for (let i = 0; i < 10; i += 1) {
      await ctx.db.run('INSERT INTO counter (n) VALUES (?)', i)
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      expect(ctx.get('db')).toBeUndefined()
      const wal = join(root, 'data.sqlite-wal')
      expect(!existsSync(wal) || statSync(wal).size === 0).toBe(true)
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    }
    expect(await ctx.db.all('SELECT n FROM counter ORDER BY n')).toEqual(Array.from({ length: 10 }, (_, n) => ({ n })))
    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()
    // Nothing holds the file: another connection takes the write lock at once.
    const other = await openNodeSqliteDatabase(join(root, 'data.sqlite'), { busyTimeoutMs: 0 })
    await other.transaction(async tx => { await tx.run('INSERT INTO counter (n) VALUES (?)', 99) })
    await other.close()
  })

  it('fails the row, and closes the file, when a migration fails', async () => {
    const root = app()
    mkdirSync(join(root, 'migrations'))
    writeFileSync(join(root, 'migrations', '001-broken.sql'), 'CREATE TABLE ok (n INTEGER);\nTHIS IS NOT SQL;\n')
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { path: 'data.sqlite', migrations: 'migrations' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
    expect(ctx.get('db')).toBeUndefined()
    const other = await openNodeSqliteDatabase(join(root, 'data.sqlite'), { busyTimeoutMs: 0 })
    expect(await other.all("SELECT name FROM sqlite_schema WHERE name = 'ok'")).toEqual([])
    await other.close()
  })

  it('defaults to data.sqlite in the app home from an appInstance service, and ignores one without a string home', async () => {
    const root = app()
    const ctx = await loader(root)
    const home = join(root, 'home')
    const withdraw = ctx.reflect.provide('appInstance', { home, dshHome: join(home, '.dsh') })
    const entryId = await ctx.loader.create({ name: './row.mjs' })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await ctx.db.exec('CREATE TABLE here (n INTEGER)')
    expect(existsSync(join(home, 'data.sqlite'))).toBe(true)
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
    const fiber = entryOf(ctx, entryId).fiber
    expect(fiber?.state).toBe(FAILED)
  })
})
