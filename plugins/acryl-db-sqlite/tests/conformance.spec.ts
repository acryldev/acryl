import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeDbConformance } from 'acryl-db/conformance'
import { afterAll } from 'vitest'
import { openNodeSqliteDatabase } from '../src/index.ts'

// A file per case, as apps use it (WAL mode needs a file; `:memory:` stays in the ported driver tests). The suite closes each database
// after its case; the folders go once every case is done.
const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describeDbConformance('acryl-db-sqlite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-db-sqlite-'))
  dirs.push(dir)
  const db = await openNodeSqliteDatabase(join(dir, 'data.sqlite'))
  return { db, close: () => db.close() }
})
