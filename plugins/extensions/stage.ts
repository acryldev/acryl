/**
 * Staging: every installed version of an extension is a complete copy under `<home>/extensions-staged/<name>/<stamp>-<hash>/`.
 *
 * Extracted from ACRYL (`acryl-extension-context/lib/stage.js`). Node caches an ES module by URL, so a re-imported file keeps its old
 * code; a copy at a new path has fresh URLs for the entry and everything it imports, so it is evaluated anew. The author's source folder
 * is never modified. The hash makes an unchanged source recognisable; the stamp makes "newest" well defined.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { FOLDER_DIGEST_SKIPPED } from '@webboxes/blends-core'
import { type PluginStore, pluginVersion } from './plugin-store.ts'
import { resolveFromApp, routerAliases } from './resolve.ts'

/**
 * Whether `node --watch` runs this process. It watches every module the process has imported, and keeps watching the paths of the runs before; a staged copy that is deleted
 * while it is watched restarts the app, and the restart stages and prunes again: a loop. So under the watcher a staged copy is never deleted (a later start without it prunes).
 */
export const watched = (): boolean => process.env.WATCH_REPORT_DEPENDENCIES === '1'

/** Delete a staged folder, unless the watcher would take the deletion for a change of the app. */
export function discard(dir: string): void {
  if (!watched()) rmSync(dir, { recursive: true, force: true })
}

/** The newest complete staged copy of `version` (copies are finished under a temporary name and renamed, so a folder with the final name is whole). */
function staged(stageRoot: string, name: string, version: string): string | undefined {
  const folder = join(stageRoot, name)
  if (!existsSync(folder)) return undefined
  const found = readdirSync(folder)
    .filter((entry) => !entry.startsWith('.') && entry.endsWith(`-${version}`))
    .sort()
    .pop()
  return found === undefined ? undefined : join(folder, found)
}

/** Copy `source` into a version folder under `stageRoot/<name>/` and return its path and version. An unchanged source reuses its copy: a restart stages nothing new. */
export function stage(
  source: string,
  stageRoot: string,
  name: string,
): { dir: string; version: string } {
  const version = pluginVersion(source)
  const existing = staged(stageRoot, name, version)
  if (existing !== undefined) return { dir: existing, version }
  const stamp = String(Date.now()).padStart(15, '0')
  const dir = join(stageRoot, name, `${stamp}-${version}`)
  const partial = join(stageRoot, name, `.${stamp}-${version}.partial`)
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(partial, { recursive: true })
  cpSync(source, partial, {
    recursive: true,
    filter: (path) => !FOLDER_DIGEST_SKIPPED.has(basename(path)),
  })
  renameSync(partial, dir)
  return { dir, version }
}

/** Delete staged versions of `name` except the ones to keep (best effort; none under the watcher, see `watched`). Modules already loaded stay in memory until the app restarts. */
export function prune(stageRoot: string, name: string, keep: readonly string[]): void {
  if (watched()) return
  const folder = join(stageRoot, name)
  if (!existsSync(folder)) return
  if (keep.length === 0) {
    rmSync(folder, { recursive: true, force: true })
    return
  }
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry)
    if (!keep.includes(path)) rmSync(path, { recursive: true, force: true })
  }
}

/** The plugin store of an app: its versions as staged copies under `stageRoot`. */
export function folderPluginStore(stageRoot: string): PluginStore {
  return {
    put: (name, source) => stage(source, stageRoot, name),
    holds: ({ dir }) => existsSync(dir),
    discard: ({ dir }) => discard(dir),
    keepOnly: (name, plugin) => prune(stageRoot, name, plugin ? [plugin.dir] : []),
    resolveImportsFrom: (appRoot) => resolveFromApp(stageRoot, appRoot, routerAliases()),
  }
}
