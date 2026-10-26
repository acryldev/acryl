import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeDbConformance } from 'acryl-db/conformance'
import { openNodeSqliteDatabase } from '../src/index.ts'

// A file per case, as apps use it (WAL mode needs a file; `:memory:` stays in the ported driver tests).
describeDbConformance('acryl-db-sqlite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-db-sqlite-'))
  const db = await openNodeSqliteDatabase(join(dir, 'data.sqlite'))
  return {
    db,
    close: async () => {
      await db.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
})
