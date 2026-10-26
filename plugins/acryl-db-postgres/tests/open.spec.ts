/**
 * `openDb`, the plain entry (`acryl-db-postgres/open`), over the network to PGlite's socket server. The last case reads the built entries,
 * so it needs `pnpm run build` first, like the Loader tests.
 */

import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { Db, DbExecutor, SqlValue } from '../src/open.ts'
import { openDb } from '../src/open.ts'
import { startTestServer, type TestServer } from './server.ts'

let server: TestServer
beforeAll(async () => { server = await startTestServer() })
afterAll(async () => { await server.stop() })

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function migrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-db-postgres-'))
  dirs.push(dir)
  await mkdir(join(dir, 'migrations'))
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(join(dir, 'migrations', name), text)))
  return join(dir, 'migrations')
}

describe('openDb', () => {
  it('applies the migrations (a path or a file URL), resolves the port without close, and exports its types', async () => {
    const folder = await migrations({ '001-notes.sql': 'CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL);\n', '002-seed.sql': "INSERT INTO notes (body) VALUES ('first');\n" })
    for (const location of [folder, pathToFileURL(folder)]) {
      const opened = await openDb({ url: await server.fresh(), migrations: location })
      try {
        expect(await opened.db.all('SELECT id, body FROM notes')).toEqual([{ id: 1, body: 'first' }])
        expect(await opened.db.get('SELECT version FROM _migrations')).toEqual({ version: 2 })
        expect(Object.keys(opened.db).sort()).toEqual(['all', 'exec', 'get', 'run', 'transaction'])
      } finally {
        await opened.close()
      }
    }
    expectTypeOf(openDb).returns.resolves.toEqualTypeOf<{ readonly db: Db, close(): Promise<void> }>()
    expectTypeOf<Db>().toExtend<DbExecutor>()
    expectTypeOf<SqlValue>().toEqualTypeOf<null | number | bigint | string | Uint8Array>()
  })

  it('reads an int8 beyond the safe range as a bigint, and numeric as exact text', async () => {
    const opened = await openDb({ url: await server.fresh() })
    try {
      expect(await opened.db.get('SELECT CAST(? AS BIGINT) AS big, CAST(? AS NUMERIC) AS exact, count(*) AS n FROM (SELECT 1) AS one', 9_007_199_254_740_993n, '0.10')).toEqual({ big: 9_007_199_254_740_993n, exact: '0.10', n: 1 })
    } finally {
      await opened.close()
    }
  })

  it('rejects a call whose values do not match its placeholders, naming both counts', async () => {
    const opened = await openDb({ url: await server.fresh() })
    try {
      await expect(opened.db.get('SELECT CAST(? AS INTEGER) AS a, CAST(? AS INTEGER) AS b', 1)).rejects.toThrow('2 ? placeholders but 1 value was given')
      await expect(opened.db.run('SELECT 1', 1)).rejects.toThrow('0 ? placeholders but 1 value was given')
      expect(await opened.db.get('SELECT 1 AS still')).toEqual({ still: 1 })
    } finally {
      await opened.close()
    }
  })

  it('closes the connection on close, waits for running calls, and a second close waits for the same one', async () => {
    const opened = await openDb({ url: await server.fresh() })
    await opened.db.exec('CREATE TABLE kept (n INTEGER)')
    const write = opened.db.run('INSERT INTO kept (n) VALUES (?)', 1)
    const closing = opened.close()
    await expect(write).resolves.toEqual({ changes: 1 })
    await closing
    await opened.close()
    await expect(opened.db.all('SELECT n FROM kept')).rejects.toThrow('closed')
    const count = server.connections()
    if (count !== undefined) await expect.poll(() => server.connections()).toBe(0)
  })

  it('leaves the schema unchanged and closes the connection when a migration fails', async () => {
    const folder = await migrations({ '001-ok.sql': 'CREATE TABLE ok (n INTEGER);\n', '002-broken.sql': 'CREATE TABLE later (n INTEGER);\nTHIS IS NOT SQL;\n' })
    const url = await server.fresh()
    await expect(openDb({ url, migrations: folder })).rejects.toThrow()
    if (server.connections() !== undefined) await expect.poll(() => server.connections()).toBe(0)
    const opened = await openDb({ url })
    try {
      expect(await opened.db.all("SELECT table_name FROM information_schema.tables WHERE table_name IN ('ok', 'later') AND table_schema = current_schema()")).toEqual([])
    } finally {
      await opened.close()
    }
  })

  it('imports nothing from Cordis in the plain entries or anything they import, at runtime or in their types', () => {
    const specifiers = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '')
    const seen = new Set<string>()
    const visit = (file: URL): void => {
      if (seen.has(file.href)) return
      seen.add(file.href)
      const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
      expect(imports.filter(spec => /cordis|schemastery|pglite/u.test(spec)), fileURLToPath(file)).toEqual([])
      for (const spec of imports) {
        if (!spec.startsWith('.')) continue
        const target = /\.(?:js|ts)$/u.test(spec) ? spec.replace(/\.ts$/u, file.pathname.endsWith('.d.ts') ? '.d.ts' : '.js') : `${spec}.js`
        visit(new URL(target, file))
      }
    }
    const lib = (file: string) => new URL(`../lib/${file}`, import.meta.url)
    visit(lib('open.js'))
    visit(lib('types/open.d.ts'))
    expect(seen.size).toBeGreaterThan(2)
  })

  it('ships pg, not PGlite: PGlite only serves the tests', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { dependencies: Record<string, string>, devDependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['@deepseek-ai/schemastery', 'acryl-db', 'pg'])
    expect(Object.keys(manifest.devDependencies)).toContain('@electric-sql/pglite')
  })
})
