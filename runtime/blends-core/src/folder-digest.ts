// The content digest of a plugin's folder: one formula for every writer and reader of a lock's `local` modules and for staging a plugin
// (ACRYL's installer names each staged copy by it; the acrylblends framework stages its extensions with it). The sha256 over each file's
// path relative to the folder (with `/` on every platform) and its bytes, files in code-unit order of that path. Folders that are never a
// plugin's own source are skipped: dependencies, git, and ACRYL's staging leftovers. Unlike the rest of this package it reads the disk.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Names skipped wherever they appear: dependencies, git metadata, and the source pointer ACRYL writes into a staged copy. */
export const FOLDER_DIGEST_SKIPPED: ReadonlySet<string> = new Set(['node_modules', '.git', 'acryl-source.json'])
/** ACRYL's staged versions of a plugin (`acryl-v-<hash>/`), copies of the folder itself. */
export const FOLDER_DIGEST_SKIPPED_PREFIX = 'acryl-v-'

function walk(dir: string, visit: (path: string, relative: string) => void, prefix = ''): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (FOLDER_DIGEST_SKIPPED.has(entry.name) || entry.name.startsWith(FOLDER_DIGEST_SKIPPED_PREFIX)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, visit, `${prefix}${entry.name}/`)
    else visit(path, `${prefix}${entry.name}`)
  }
}

/** The sha256 of a folder's content as lowercase hex; `length` shortens it (a lock uses all 64, prefixed `sha256:`). */
export function digestFolder(dir: string, length = 64): string {
  const files: Array<[string, string]> = []
  walk(dir, (path, relative) => files.push([relative, path]))
  files.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  const hash = createHash('sha256')
  for (const [relative, path] of files) hash.update(relative).update('\0').update(readFileSync(path)).update('\0')
  return hash.digest('hex').slice(0, length)
}
