import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Root directory of this pack on disk, as a path the agent's file and search
 * tools can actually read. Inside a packaged Desktop app this module is
 * resolved through the virtual `app.asar/...` path, which Electron's own fs
 * can read but child-process tools (search, shell) cannot; the same files also
 * exist under `app.asar.unpacked` (node_modules is asarUnpack'd), so prefer
 * that real path when it exists (spec 037 research Q3).
 * @param {string} [moduleUrl] this package's own module URL (injectable for tests)
 */
export function resolvePackRoot(moduleUrl = import.meta.url) {
  const virtualRoot = dirname(dirname(fileURLToPath(moduleUrl)))
  const marker = `app.asar${virtualRoot.includes('\\') ? '\\' : '/'}`
  if (virtualRoot.includes(marker)) {
    const unpacked = virtualRoot.replace('app.asar', 'app.asar.unpacked')
    if (existsSync(unpacked)) return unpacked
  }
  return virtualRoot
}
