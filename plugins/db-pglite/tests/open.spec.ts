/**
 * `openDb` on a data folder: the data survives closing and reopening it (in this process and from another one), migrations run once, and
 * one process at a time holds the folder. The cases with a second process run the built `lib/open.js`, so they need `pnpm run build`.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCK_FILE } from '../src/folder-lock.ts'
import { IN_MEMORY, openDb, type OpenDb } from '../src/open.ts'

const BUILT_OPEN = new URL('../lib/open.js', import.meta.url).href

const folders: string[] = []
const opened: OpenDb[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map(database => database.close()))
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-db-pglite-open-'))
  folders.push(root)
  return root
}

async function open(options: Parameters<typeof openDb>[0]): Promise<OpenDb> {
  const database = await openDb(options)
  opened.push(database)
  return database
}

/** Run `body` in another Node process with `openDb` from the built entry; it prints `ready` once the folder is open. */
function child(body: string): { readonly ready: Promise<void>; readonly exited: Promise<{ code: number | null; out: string; err: string }>; stop(): void } {
  const script = `import { openDb } from ${JSON.stringify(BUILT_OPEN)}\n${body}\n`
  const process_ = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  let markReady!: () => void
  const ready = new Promise<void>((resolve) => { markReady = resolve })
  process_.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); if (out.includes('ready')) markReady() })
  process_.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
  const exited = new Promise<{ code: number | null; out: string; err: string }>((resolve) => { process_.on('exit', code => { resolve({ code, out, err }) }) })
  return { ready, exited, stop: () => { process_.stdin.end() } }
}

describe('acryl-db-pglite on a data folder', () => {
  it('keeps the data across closing and reopening the folder', async () => {
    const dataDir = join(folder(), 'pglite')
    const first = await openDb({ dataDir })
    await first.db.exec('CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL, raw BYTEA)')
    await first.db.transaction(async (tx) => {
      await tx.run('INSERT INTO notes (body, raw) VALUES (?, ?)', 'kept', new Uint8Array([1, 2, 3]))
    })
    await first.close()
    expect(existsSync(join(dataDir, LOCK_FILE))).toBe(false)

    const second = await open({ dataDir })
    expect(await second.db.all('SELECT id, body, raw FROM notes')).toEqual([{ id: 1, body: 'kept', raw: new Uint8Array([1, 2, 3]) }])
  })

  it('reads in this process what another process wrote and closed', async () => {
    const dataDir = join(folder(), 'pglite')
    const writer = child(`
      const { db, close } = await openDb({ dataDir: ${JSON.stringify(dataDir)} })
      await db.exec('CREATE TABLE visits (n INTEGER)')
      for (let n = 1; n <= 3; n += 1) await db.run('INSERT INTO visits (n) VALUES (?)', n)
      await close()
    `)
    const done = await writer.exited
    expect(done, done.err).toMatchObject({ code: 0 })
    const reader = await open({ dataDir })
    expect(await reader.db.all('SELECT n FROM visits ORDER BY n')).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('applies a migration once, however often the folder is reopened', async () => {
    const root = folder()
    const migrations = join(root, 'migrations')
    mkdirSync(migrations)
    writeFileSync(join(migrations, '001-notes.sql'), 'CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL);\n')
    const dataDir = join(root, 'pglite')
    for (let round = 1; round <= 3; round += 1) {
      const database = await openDb({ dataDir, migrations })
      await database.db.run('INSERT INTO notes (body) VALUES (?)', `round ${String(round)}`)
      await database.close()
    }
    const last = await open({ dataDir, migrations })
    expect(await last.db.all('SELECT body FROM notes ORDER BY id')).toEqual([{ body: 'round 1' }, { body: 'round 2' }, { body: 'round 3' }])
  })

  it('refuses a folder that is already open, here or in another process, and opens it once it is closed', async () => {
    const dataDir = join(folder(), 'pglite')
    const first = await openDb({ dataDir })
    await expect(openDb({ dataDir })).rejects.toThrow(/already open in this process/u)
    await first.close()

    const holder = child(`
      const { close } = await openDb({ dataDir: ${JSON.stringify(dataDir)} })
      console.log('ready')
      process.stdin.resume()
      process.stdin.on('end', async () => { await close() })
    `)
    await holder.ready
    await expect(openDb({ dataDir })).rejects.toThrow(/already open in process \d+/u)
    holder.stop()
    expect((await holder.exited).code).toBe(0)
    const after = await open({ dataDir })
    expect(await after.db.get('SELECT 1 AS one')).toEqual({ one: 1 })
  })

  it('takes over the lock of a process that is gone', async () => {
    const dataDir = join(folder(), 'pglite')
    // A lock left by a process that was killed: the pid of one that has exited.
    const gone = child('console.log(`pid ${String(process.pid)}`)')
    const { code, out } = await gone.exited
    expect(code).toBe(0)
    const pid = Number(/pid (\d+)/u.exec(out)?.[1])
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(join(dataDir, LOCK_FILE), JSON.stringify({ pid, token: 'left-behind' }))
    const database = await open({ dataDir })
    expect(await database.db.get('SELECT 1 AS one')).toEqual({ one: 1 })
  })

  it('releases the folder when a migration fails, with the schema unchanged', async () => {
    const root = folder()
    const migrations = join(root, 'migrations')
    mkdirSync(migrations)
    writeFileSync(join(migrations, '001-good.sql'), 'CREATE TABLE good (id INTEGER);\n')
    writeFileSync(join(migrations, '002-bad.sql'), 'CREATE TABLE bad (id INTEGER REFERENCES nowhere (id));\n')
    const dataDir = join(root, 'pglite')
    await expect(openDb({ dataDir, migrations })).rejects.toThrow()
    expect(existsSync(join(dataDir, LOCK_FILE))).toBe(false)
    const after = await open({ dataDir })
    expect(await after.db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('good', 'bad')")).toEqual([])
  })

  it('refuses calls once closed, and a second close waits for the same one', async () => {
    const database = await openDb({ dataDir: IN_MEMORY })
    const pending = database.db.run('CREATE TABLE late (n INTEGER)')
    const closing = database.close()
    expect(database.close()).toBe(closing)
    await pending
    await closing
    await expect(database.db.get('SELECT 1')).rejects.toThrow(/closed/u)
  })
})
