/**
 * PGlite in Electron's main process (spec 049 slice 2b's third gate): run as Electron's main script, never as Node.
 *
 *   electron --no-sandbox plugins/acryl-db-pglite/scripts/electron-main-check.mjs
 *
 * It opens a data folder through the built `lib/open.js`, migrates it, writes in a transaction, closes, opens it again and reads what it
 * wrote. It prints one line, `acryl-db-pglite in Electron main: ok ...`, and exits 0; any failure prints the error and exits 1. The
 * package must be built first. Electron comes from the caller (Desktop's own copy in CI), so this package does not download one.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

// Electron's own folders (userData, its GPU caches) go to a throwaway folder, never the user's real profile; no GPU is needed.
const userData = mkdtempSync(join(tmpdir(), 'acryl-db-pglite-electron-user-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()

const { openDb } = await import(new URL('../lib/open.js', import.meta.url).href)

async function check() {
  if (process.type !== 'browser' || process.versions.electron === undefined) throw new Error(`not Electron's main process (process.type ${String(process.type)})`)
  if (process.env.ELECTRON_RUN_AS_NODE !== undefined) throw new Error('ELECTRON_RUN_AS_NODE is set: this would run as Node, not as Electron\'s main process')
  const root = mkdtempSync(join(tmpdir(), 'acryl-db-pglite-electron-'))
  try {
    const migrations = join(root, 'migrations')
    mkdirSync(migrations)
    writeFileSync(join(migrations, '001-notes.sql'), 'CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL, raw BYTEA);\n')
    const dataDir = join(root, 'pglite')
    const first = await openDb({ dataDir, migrations })
    await first.db.transaction(async (tx) => {
      await tx.run('INSERT INTO notes (body, raw) VALUES (?, ?)', 'written in Electron', new Uint8Array([1, 2, 3]))
    })
    await first.close()
    const second = await openDb({ dataDir, migrations })
    const rows = await second.db.all('SELECT id, body, raw FROM notes')
    await second.close()
    const row = rows[0]
    if (rows.length !== 1 || row.id !== 1 || row.body !== 'written in Electron' || !(row.raw instanceof Uint8Array) || row.raw.join(',') !== '1,2,3') {
      throw new Error(`read back ${JSON.stringify(rows)}`)
    }
    return { electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** Exit with `code`. Electron's folder is removed if it can be: on Windows, Electron still holds files in it until the process ends. */
function done(code) {
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // Left in the system's temp folder.
  }
  app.exit(code)
}

check().then((result) => {
  process.stdout.write(`acryl-db-pglite in Electron main: ok ${JSON.stringify(result)}\n`)
  done(0)
}, (error) => {
  process.stderr.write(`acryl-db-pglite in Electron main: FAILED ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  done(1)
})
