/**
 * `openDb`, the plain entry (`acryl-db-sqlite/open`) for code without Cordis. The last case reads the built entries, so it needs
 * `pnpm run build` first, like the Loader tests.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb, openNodeSqliteDatabase } from '../src/index.ts'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function app(migrations: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-db-open-'))
  dirs.push(dir)
  await mkdir(join(dir, 'migrations'))
  await Promise.all(Object.entries(migrations).map(([name, text]) => writeFile(join(dir, 'migrations', name), text)))
  return dir
}

describe('openDb', () => {
  it('creates the file\'s folder, applies the migrations (a path or a file URL), and resolves the port without close', async () => {
    const dir = await app({ '001-notes.sql': 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\n', '002-seed.sql': "INSERT INTO notes (body) VALUES ('first');\n" })
    for (const migrations of [join(dir, 'migrations'), pathToFileURL(join(dir, 'migrations'))]) {
      const path = join(dir, typeof migrations === 'string' ? 'a' : 'b', 'data.sqlite')
      const opened = await openDb({ path, migrations })
      try {
        expect(await opened.db.all('SELECT body FROM notes')).toEqual([{ body: 'first' }])
        expect(await opened.db.get('SELECT version FROM _migrations')).toEqual({ version: 2 })
        expect('close' in opened.db).toBe(false)
      } finally {
        await opened.close()
      }
    }
  })

  it('opens :memory: (migrations included) and creates a nested parent folder', async () => {
    const dir = await app({ '001-notes.sql': 'CREATE TABLE notes (body TEXT);\n' })
    const memory = await openDb({ path: ':memory:', migrations: join(dir, 'migrations') })
    await memory.db.run('INSERT INTO notes (body) VALUES (?)', 'kept')
    expect(await memory.db.all('SELECT body FROM notes')).toEqual([{ body: 'kept' }])
    await memory.close()
    expect(existsSync(join(dir, ':memory:'))).toBe(false)
    const nested = join(dir, 'one', 'two', 'three', 'data.sqlite')
    const opened = await openDb({ path: nested })
    expect(await opened.db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
    await opened.close()
    expect(existsSync(nested)).toBe(true)
  })

  it('releases the file on close, with an empty WAL, and a second close does nothing', async () => {
    const dir = await app()
    const path = join(dir, 'data.sqlite')
    const opened = await openDb({ path })
    await opened.db.exec('CREATE TABLE kept (n INTEGER)')
    await opened.db.run('INSERT INTO kept (n) VALUES (?)', 1)
    await opened.close()
    await opened.close()
    const wal = `${path}-wal`
    expect(!existsSync(wal) || statSync(wal).size === 0).toBe(true)
    await expect(opened.db.all('SELECT n FROM kept')).rejects.toThrow()
    const other = await openNodeSqliteDatabase(path, { busyTimeoutMs: 0 })
    await other.transaction(async tx => { await tx.run('INSERT INTO kept (n) VALUES (?)', 2) })
    expect(await other.all('SELECT n FROM kept ORDER BY n')).toEqual([{ n: 1 }, { n: 2 }])
    await other.close()
  })

  it('closes the file and leaves it unchanged when a migration fails', async () => {
    const dir = await app({ '001-broken.sql': 'CREATE TABLE ok (n INTEGER);\nTHIS IS NOT SQL;\n' })
    const path = join(dir, 'data.sqlite')
    await expect(openDb({ path, migrations: join(dir, 'migrations') })).rejects.toThrow()
    const other = await openNodeSqliteDatabase(path, { busyTimeoutMs: 0 })
    await other.transaction(async tx => { await tx.exec('CREATE TABLE probe (n INTEGER)') })
    expect(await other.all("SELECT name FROM sqlite_schema WHERE name IN ('ok', '_migrations')")).toEqual([])
    await other.close()
  })

  it('refuses misnumbered migration files before it opens anything', async () => {
    const dir = await app({ '002-late.sql': 'CREATE TABLE late (n INTEGER);\n' })
    const path = join(dir, 'data.sqlite')
    await expect(openDb({ path, migrations: join(dir, 'migrations') })).rejects.toThrow('should be number 1')
    expect(existsSync(path)).toBe(false)
  })

  it('imports nothing from Cordis in the plain entries or anything they import, at runtime or in their types', () => {
    const specifiers = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '')
    const seen = new Set<string>()
    const visit = (file: URL): void => {
      if (seen.has(file.href)) return
      seen.add(file.href)
      const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
      expect(imports.filter(spec => /cordis|schemastery/u.test(spec)), fileURLToPath(file)).toEqual([])
      for (const spec of imports) {
        if (!spec.startsWith('.')) continue
        const target = /\.(?:js|ts)$/u.test(spec) ? spec.replace(/\.ts$/u, file.pathname.endsWith('.d.ts') ? '.d.ts' : '.js') : `${spec}.js`
        visit(new URL(target, file))
      }
    }
    const lib = (pkg: string, file: string) => new URL(`../../${pkg}/lib/${file}`, import.meta.url)
    for (const [pkg, file] of [['acryl-db-sqlite', 'open.js'], ['acryl-db-sqlite', 'types/open.d.ts'], ['acryl-db', 'index.js'], ['acryl-db', 'types/index.d.ts']] as const) visit(lib(pkg, file))
    expect(seen.size).toBeGreaterThan(4)
  })
})
