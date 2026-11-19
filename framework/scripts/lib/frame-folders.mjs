/**
 * Where each frame package's source is: `frame/packages.json` keys it by its folder name, and `path` (relative to this framework's root)
 * names the folder. Inside ACRYL's monorepo (spec 051) every one lives in the repository's flat plugins/ or runtime/. The one answer every
 * script uses.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Key (the folder's name) to absolute folder, in the file's order. Throws when an entry names no `path`. */
export function frameFolders(root) {
  const { packages } = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
  return new Map(
    Object.entries(packages).map(([key, entry]) => {
      if (typeof entry.path !== 'string')
        throw new Error(`frame/packages.json: ${key} names no path (the folder of its source)`)
      return [key, resolve(root, entry.path)]
    }),
  )
}
