/** The catalog's file in the user's ACRYL home, written atomically. */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CatalogStore } from './catalog.ts'

/** The catalog file in the app's ACRYL home (from the `appInstance` service: this package never looks up a home itself). */
export function agentsFile(appHome: string): string {
  return join(appHome, 'workspace', 'agents.json')
}

/** The preferences file, next to the catalog. */
export function agentSettingsFile(appHome: string): string {
  return join(dirname(agentsFile(appHome)), 'agent-settings.json')
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
