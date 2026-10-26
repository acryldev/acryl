/**
 * Creates PGlite's database cluster once per run, before any test file starts. A fresh PGlite runs initdb, about 85% of its start (0.9 s of
 * 1 s on an M-series Mac, several seconds on a loaded CI runner), and every test file used to run it in its `beforeAll`, all at once. Each file
 * now loads this saved data directory instead (about 0.13 s). With `ACRYL_DB_POSTGRES_URL` set, the tests use that server and this does nothing.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The saved PGlite data directory (a tar file), or '' when the tests use a real server. */
    pgliteDataDir: string
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const real = process.env['ACRYL_DB_POSTGRES_URL']
  if (real !== undefined && real !== '') {
    project.provide('pgliteDataDir', '')
    return () => {}
  }
  const db = await PGlite.create()
  const dump = await db.dumpDataDir('none')
  await db.close()
  const folder = mkdtempSync(join(tmpdir(), 'acryl-db-postgres-pglite-'))
  const file = join(folder, 'pgdata.tar')
  writeFileSync(file, new Uint8Array(await dump.arrayBuffer()))
  project.provide('pgliteDataDir', file)
  return () => { rmSync(folder, { recursive: true, force: true }) }
}
