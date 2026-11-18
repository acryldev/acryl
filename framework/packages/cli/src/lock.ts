/**
 * What an app knows about the library plugins it carries: `plugins/library.lock.json` records, for every library plugin copied into the app, the version it came from and a hash of each file
 * as it was copied. `acrylblends upgrade` reads it to tell a file nobody touched (safe to replace) from one the app edited (never replaced without `--force`). An app made before the lock existed
 * has none; for it `upgrade` falls back to the hashes of the released versions (`shared/library-history.json`, made by `scripts/build-library-history.mjs`).
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sharedDir } from './templates'
import { VERSION } from './version'

export const LOCK_FILE = 'library.lock.json'

export interface Lock {
  version: number
  plugins: Record<string, { from: string; files: Record<string, string> }>
}

/** A file's identity: a hash of its text with line endings normalized (a checkout may have changed them), cut to 20 hex digits. */
export function digest(content: Buffer | string): string {
  const text = typeof content === 'string' ? content : content.toString('utf8')
  return createHash('sha256').update(text.replace(/\r\n/gu, '\n')).digest('hex').slice(0, 20)
}

/** Every file below `dir`, as `relative/path` (forward slashes) to its {@link digest}. */
export function hashFolder(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (folder: string, inside: string): void => {
    for (const entry of readdirSync(folder).sort()) {
      const path = join(folder, entry)
      const name = inside === '' ? entry : `${inside}/${entry}`
      if (statSync(path).isDirectory()) walk(path, name)
      else files[name] = digest(readFileSync(path))
    }
  }
  if (existsSync(dir)) walk(dir, '')
  return files
}

export function readLock(pluginsDir: string): Lock {
  const file = join(pluginsDir, LOCK_FILE)
  if (!existsSync(file)) return { version: 1, plugins: {} }
  try {
    const lock = JSON.parse(readFileSync(file, 'utf8')) as Lock
    return { version: 1, plugins: lock.plugins ?? {} }
  } catch {
    return { version: 1, plugins: {} }
  }
}

/** Record that `name` was copied from this version of the library, with the hashes of the files as they now are. */
export function recordLock(pluginsDir: string, name: string, files: Record<string, string>): void {
  const lock = readLock(pluginsDir)
  lock.plugins[name] = { from: VERSION, files }
  const sorted = Object.fromEntries(
    Object.entries(lock.plugins).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(
    join(pluginsDir, LOCK_FILE),
    `${JSON.stringify({ version: 1, plugins: sorted }, null, 2)}\n`,
  )
}

/** Plugin to file to the hashes that file has had in released versions. */
export type History = Record<string, Record<string, string[]>>

export function readHistory(): History {
  const file = join(sharedDir(), 'library-history.json')
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')) as History
}
