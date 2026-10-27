import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeDbConformance } from 'acrylblends/db/conformance'
import { afterAll } from 'vitest'
import { IN_MEMORY, openDb } from '../src/open.ts'

// Through `openDb`, the provider's one opening: the suite unchanged, once in memory and once in data folders on this machine's disk.
describeDbConformance('acryl-db-pglite (in memory)', () => openDb({ dataDir: IN_MEMORY }))

const folders: string[] = []
afterAll(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
describeDbConformance('acryl-db-pglite (data folder)', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'acryl-db-pglite-'))
  folders.push(folder)
  return openDb({ dataDir: join(folder, 'pglite') })
})
