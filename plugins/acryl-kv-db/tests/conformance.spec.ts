import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from 'acryl-db-sqlite/open'
import { describeKvConformance, type KvUnderTest } from 'acryl-kv/conformance'
import { afterAll } from 'vitest'
import { kvOnDb } from '../src/open.ts'

// Through `openDb` from the SQLite provider, a file per case as apps use it. The suite closes each store after its case; the folders go once
// every case is done.
const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function underTest(path: string): Promise<KvUnderTest> {
  const opened = await openDb({ path })
  return {
    kv: kvOnDb(opened.db),
    close: opened.close,
    reopen: async () => {
      await opened.close()
      return underTest(path)
    },
  }
}

describeKvConformance('acryl-kv-db on acryl-db-sqlite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-kv-db-'))
  dirs.push(dir)
  return underTest(join(dir, 'data.sqlite'))
})
