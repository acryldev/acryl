import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { SOURCE_FILE } from './stage.js'

/**
 * The source folder is authoritative; the profile's install list is derived state (pi.dev: "the extension filesystem is authoritative, the
 * runtime registry is ephemeral and reconstructible"). This module answers two questions from the filesystem alone:
 *
 *  - WHERE do extensions live? Two scopes, like pi's `.pi/extensions/` and `~/.pi/agent/extensions/`:
 *      project  `<workspace>/.acryl-extensions/<name>/`   only for that project (and can be committed to its git repository)
 *      global   `<ACRYL home>/extensions/<name>/`          every project and every surface that runs against this ACRYL home
 *    Discovery is one level deep (a folder with a package.json is an extension; nothing below it is), paths are compared by real path so a
 *    symlink or `../` spelling never loads twice, and on a name clash the project copy wins and the global one is reported as shadowed.
 *  - WHAT is the state of an install? in-sync, changed (the source differs from what is installed), or stale (the source is gone).
 */

/** The global extensions directory for an ACRYL home: `<ACRYL home>/extensions` (the DSH home is `<ACRYL home>/.dsh`). */
export function globalExtensionsDir(dshHome) {
  if (typeof dshHome !== 'string' || !isAbsolute(dshHome)) return undefined
  return join(basename(dshHome) === '.dsh' ? dirname(dshHome) : dshHome, 'extensions')
}

/** Real path, or the path itself when it does not exist (a stale source still needs a stable identity). */
export function canonical(path, fs = { realpathSync }) {
  try { return fs.realpathSync(path) } catch { return path }
}

/**
 * Extension folders under the project and global roots.
 * @param {{ workspaceDir?: string, globalDir?: string }} roots
 * @returns {Array<{ name: string, dir: string, scope: 'project' | 'global', shadowed: boolean }>}
 */
export function discoverExtensions({ workspaceDir, globalDir }, fs = { existsSync, readdirSync, readFileSync, realpathSync }) {
  const found = []
  const seenDirs = new Set()
  const claimedNames = new Set()
  const roots = [
    ['project', workspaceDir && isAbsolute(workspaceDir) ? join(workspaceDir, '.acryl-extensions') : undefined],
    ['global', globalDir && isAbsolute(globalDir) ? globalDir : undefined],
  ]
  for (const [scope, root] of roots) {
    if (!root || !fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const manifest = join(root, entry.name, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const dir = canonical(join(root, entry.name), fs)
      if (seenDirs.has(dir)) continue
      seenDirs.add(dir)
      let name = entry.name
      try { const declared = JSON.parse(fs.readFileSync(manifest, 'utf8')).name; if (typeof declared === 'string' && declared !== '') name = declared } catch { /* lint reports it on install */ }
      found.push({ name, dir, scope, shadowed: claimedNames.has(name) })
      claimedNames.add(name)
    }
  }
  return found
}

/** What a staged install recorded about itself: its source folder and the content hash it was built from. */
export function stagedInfo(installedDir, fs = { existsSync, readFileSync }) {
  try {
    const file = join(installedDir, SOURCE_FILE)
    if (!fs.existsSync(file)) return undefined
    const { source, version } = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof source === 'string' ? { source, version: typeof version === 'string' ? version : undefined } : undefined
  } catch { return undefined }
}

/** `in-sync`, `changed`, or `stale` for one installed local plugin, given the source hash function. */
export function installState(plugin, hashSource, fs = { existsSync }) {
  if (!fs.existsSync(join(plugin.installedFrom, 'package.json'))) return 'stale'
  const recorded = plugin.installedDir ? stagedInfo(plugin.installedDir)?.version : undefined
  return recorded !== undefined && recorded === hashSource(plugin.installedFrom) ? 'in-sync' : 'changed'
}
