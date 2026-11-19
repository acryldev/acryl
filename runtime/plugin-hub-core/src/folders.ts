// Where source plugins and the plugin store live (spec 044, "One term: plugin", build step 1b), and the one-time move from the folders they had
// before the rename. Every reader of these folders asks here, so the names are written once:
//
//   a project's source plugins        <project>/.acryl-plugins/<name>/                       (was .acryl-extensions/)
//   an app instance's, inside a project <project>/.acryl/instances/<scope>/plugins/<name>/   (was .../extensions/)
//   an app home's own source plugins   <home>/plugins/<name>/                                 (was <home>/extensions/)
//   an app home's plugin store         <home>/plugins/.store/                                 (was <home>/plugins/store/)
//
// A dot name is never a plugin name, so the store and a plugin named `store` cannot collide. An old folder is moved the first time its new place is
// asked for: renamed whole when the new one does not exist, otherwise entry by entry, and an entry whose name is already taken in the new folder stays
// where it is and is reported. Nothing is deleted except an old folder left empty by the move.
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

export const PROJECT_PLUGINS_FOLDER = '.acryl-plugins'
export const HOME_PLUGINS_FOLDER = 'plugins'
export const STORE_FOLDER = '.store'

const LEGACY_PROJECT_PLUGINS_FOLDER = '.acryl-extensions'
const LEGACY_HOME_PLUGINS_FOLDER = 'extensions'
const LEGACY_STORE_FOLDER = 'store'

/** What a move did: entries left in the old folder because the new one already had that name. */
export interface FolderMove {
  readonly from: string
  readonly to: string
  readonly kept: readonly string[]
}

/** Reports a move that could not take everything (a person decides what to do with both copies). */
export type MoveReporter = (move: FolderMove) => void

const warnOnce = new Set<string>()
const defaultReporter: MoveReporter = move => {
  const key = `${move.from}\0${move.to}`
  if (warnOnce.has(key)) return
  warnOnce.add(key)
  process.emitWarning(`${move.from} still holds ${move.kept.join(', ')}: ${move.to} already has folders with those names, so they were not moved`)
}

/** Move `from` to `to` as described above; a no-op when `from` does not exist. */
export function moveFolder(from: string, to: string, report: MoveReporter = defaultReporter): FolderMove | undefined {
  if (!existsSync(from)) return undefined
  if (!existsSync(to)) {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    return { from, to, kept: [] }
  }
  const kept: string[] = []
  for (const entry of readdirSync(from)) {
    if (existsSync(join(to, entry))) kept.push(entry)
    else renameSync(join(from, entry), join(to, entry))
  }
  if (kept.length === 0) rmdirSync(from)
  else report({ from, to, kept })
  return { from, to, kept }
}

/** A project's source plugins: `<project>/.acryl-plugins/`. */
export function projectPluginsDir(projectDir: string, report?: MoveReporter): string {
  const dir = join(projectDir, PROJECT_PLUGINS_FOLDER)
  moveFolder(join(projectDir, LEGACY_PROJECT_PLUGINS_FOLDER), dir, report)
  return dir
}

/** An app home's own source plugins: `<home>/plugins/`. The store's old place inside it moves first, so it is never taken for a plugin. */
export function homePluginsDir(home: string, report?: MoveReporter): string {
  const dir = join(home, HOME_PLUGINS_FOLDER)
  moveFolder(join(dir, LEGACY_STORE_FOLDER), join(dir, STORE_FOLDER), report)
  moveFolder(join(home, LEGACY_HOME_PLUGINS_FOLDER), dir, report)
  return dir
}

/**
 * Where an app instance keeps its plugin store, under that instance's home: per instance, never machine-wide, so a development or test run never
 * writes into the user's real home. The home itself comes from the app (ACRYL's AppInstance family).
 */
export function storeRootOf(home: string, report?: MoveReporter): string {
  const plugins = join(home, HOME_PLUGINS_FOLDER)
  const dir = join(plugins, STORE_FOLDER)
  // Only the store's index marks the old folder as the store: a source plugin named `store` has a package.json instead.
  if (existsSync(join(plugins, LEGACY_STORE_FOLDER, 'index.json')) && !existsSync(join(plugins, LEGACY_STORE_FOLDER, 'package.json'))) {
    moveFolder(join(plugins, LEGACY_STORE_FOLDER), dir, report)
  }
  return dir
}

/**
 * A source folder an install recorded before the rename, where it is now: the same path with the old folder name replaced, when the recorded one is
 * gone and the renamed one exists. Any other path is returned as it is.
 */
export function currentSourcePath(recorded: string): string {
  if (existsSync(recorded)) return recorded
  const renamed = recorded
    .replace(`${sep}${LEGACY_PROJECT_PLUGINS_FOLDER}${sep}`, `${sep}${PROJECT_PLUGINS_FOLDER}${sep}`)
    .replace(new RegExp(`\\${sep}${LEGACY_HOME_PLUGINS_FOLDER}\\${sep}(?=[^\\${sep}]+\\${sep}?$)`, 'u'), `${sep}${HOME_PLUGINS_FOLDER}${sep}`)
  return renamed !== recorded && existsSync(renamed) ? renamed : recorded
}
