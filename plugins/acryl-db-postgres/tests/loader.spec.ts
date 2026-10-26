/**
 * The provider mounted the way production mounts every plugin: a real `@deepseek-ai/cordis-plugin-loader` row pointing at the built
 * `lib/index.js`, with a consumer that declares `inject: ['db']`, over the network to PGlite's socket server.
 * @throws if the package has not been built: run `pnpm run build` first.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { Db } from 'acryl-db'
import type {} from 'acryl-db/cordis'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startTestServer, type TestServer } from './server.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const FAILED = 3 as FiberState.FAILED
const DISPOSED = 4 as FiberState.DISPOSED
const BUILT_ENTRY = new URL('../lib/index.js', import.meta.url).href

let server: TestServer
beforeAll(async () => { server = await startTestServer() })
afterAll(async () => { await server.stop() })

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-db-postgres-loader-'))
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

describe('acryl-db-postgres through a real Loader', () => {
  it('keeps a consumer PENDING until the row provides db, migrates from the app\'s folder, and serves queries', async () => {
    const root = app()
    mkdirSync(join(root, 'migrations'))
    writeFileSync(join(root, 'migrations', '001-notes.sql'), 'CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL);\n')
    const ctx = await loader(root)
    const seen: Db[] = []
    const fiber = ctx.plugin({ name: 'notes-app', inject: ['db'], apply: (inner: Context) => { seen.push(inner.db) } })
    await fiber
    expect(fiber.state).toBe(PENDING)

    const entryId = await ctx.loader.create({ name: './row.mjs', config: { url: await server.fresh(), migrations: 'migrations' } })
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    await fiber
    expect(fiber.state).toBe(ACTIVE)
    expect(await seen[0]!.get('INSERT INTO notes (body) VALUES (?) RETURNING id', 'first')).toEqual({ id: 1 })
    expect('close' in ctx.db).toBe(false)
  })

  it('closes its connection on unload and reconnects on reload, ten times', async () => {
    const root = app()
    const ctx = await loader(root)
    const entryId = await ctx.loader.create({ name: './row.mjs', config: { url: await server.fresh() } })
    await ctx.loader.await()
    await ctx.db.exec('CREATE TABLE counter (n INTEGER)')
    for (let i = 0; i < 10; i += 1) {
      await ctx.db.run('INSERT INTO counter (n) VALUES (?)', i)
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      const fiber = entryOf(ctx, entryId).fiber
      expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
      expect(ctx.get('db')).toBeUndefined()
      if (server.connections() !== undefined) await expect.poll(() => server.connections()).toBe(0)
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    }
    expect(await ctx.db.all('SELECT n FROM counter ORDER BY n')).toEqual(Array.from({ length: 10 }, (_, n) => ({ n })))
  })

  it('fails the row when there is no url and no DATABASE_URL', async () => {
    const saved = process.env['DATABASE_URL']
    delete process.env['DATABASE_URL']
    try {
      const ctx = await loader(app())
      const entryId = await ctx.loader.create({ name: './row.mjs' })
      await ctx.loader.await()
      expect(entryOf(ctx, entryId).fiber?.state).toBe(FAILED)
      expect(ctx.get('db')).toBeUndefined()
    } finally {
      if (saved !== undefined) process.env['DATABASE_URL'] = saved
    }
  })
})
