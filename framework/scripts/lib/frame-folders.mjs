/**
 * Where each frame package's source is: `frame/packages.json` keys it by its folder name, with `path` (relative to this framework's root)
 * when the source lives outside `ide/` (spec 051: a package ACRYL and the frame share lives once, in the repository's `plugins/` or `runtime/`).
 * Without `path` the folder is `ide/<key>` (none is, since spec 051 moved the frame's own packages to the repository's flat plugins/). The one answer every script uses.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Key (the folder's name) to absolute folder, in the file's order. */
export function frameFolders(root) {
  const { packages } = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
  return new Map(
    Object.entries(packages).map(([key, entry]) => [
      key,
      resolve(root, entry.path ?? join('ide', key)),
    ]),
  )
}
