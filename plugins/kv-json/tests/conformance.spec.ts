import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeKvConformance, type KvUnderTest } from 'acryl-kv/conformance'
import { afterAll } from 'vitest'
import { openKv } from '../src/open.ts'

// Through `openKv`, the opening both the plain entry and the Cordis plugin use. A folder per case; the suite closes each store after its
// case, and the folders go once every case is done.
const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function underTest(path: string): Promise<KvUnderTest> {
  return openKv({ path }).then(opened => ({
    kv: opened.kv,
    close: opened.close,
    reopen: async () => {
      await opened.close()
      return underTest(path)
    },
  }))
}

describeKvConformance('acryl-kv-json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-kv-json-'))
  dirs.push(dir)
  return underTest(join(dir, 'kv.json'))
})
