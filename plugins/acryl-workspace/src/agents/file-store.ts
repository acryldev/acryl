/** The catalog's file in the user's ACRYL home, written atomically. */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CatalogStore } from './catalog.ts'

/** The single place this package reads `ACRYL_HOME`: `~/.acryl` unless it is set. */
export function defaultAgentsFile(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.ACRYL_HOME !== undefined && env.ACRYL_HOME !== '' ? env.ACRYL_HOME : join(homedir(), '.acryl')
  return join(home, 'workspace', 'agents.json')
}

export function createFileCatalogStore(path: string): CatalogStore {
  return {
    async read() {
      try {
        return await readFile(path, 'utf8')
      } catch (cause) {
        if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT') return null
        throw cause
      }
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true })
      const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`
      await writeFile(temp, text, { encoding: 'utf8', mode: 0o600 })
      await rename(temp, path)
    },
  }
}
