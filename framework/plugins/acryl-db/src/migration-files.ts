/**
 * An app's migrations as numbered SQL files: `migrations/001-notes.sql`, `002-tags.sql`, ... Each file is one migration, run as one
 * `exec` (so it may hold several statements), numbered from 1 with no gaps.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Migration } from './facade/migrations.ts'

const FILE = /^(\d+)-[a-z0-9][a-z0-9-]*\.sql$/u

/**
 * Read every `NNN-name.sql` file of a folder, in number order.
 * @throws when a `.sql` file is not named `NNN-name.sql`, or the numbers do not run 1, 2, 3, ... without gaps or repeats.
 */
export async function readMigrationFiles(folder: string | URL): Promise<Migration[]> {
  const dir = typeof folder === 'string' ? folder : fileURLToPath(folder)
  const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()
  const numbered = files.map(name => {
    const match = FILE.exec(name)
    if (match?.[1] === undefined) throw new Error(`acryl-db: migration file ${name} in ${dir} must be named NNN-name.sql, like 001-notes.sql`)
    return { name, version: Number(match[1]) }
  }).sort((a, b) => a.version - b.version)
  numbered.forEach((file, index) => {
    if (file.version !== index + 1) {
      throw new Error(`acryl-db: migration ${file.name} in ${dir} should be number ${String(index + 1)}; the files must be numbered 1, 2, 3, ... with no gaps or repeats`)
    }
  })
  return Promise.all(numbered.map(async file => ({ version: file.version, statements: [await readFile(join(dir, file.name), 'utf8')] })))
}
