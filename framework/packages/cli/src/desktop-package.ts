/**
 * Spec 051 T011: an app stops carrying its copies of the desktop shell and the instance (`plugins/desktop`, `plugins/instance`) and installs
 * them as packages instead. This module only plans that move for one app; `upgrade` shows the plan and applies it. An app whose copy it
 * edited keeps the copy (a conflict, named file by file): its changes are its own and are never thrown away.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Io } from './io.ts'
import { readLibrary } from './library.ts'
import { hashFolder, readHistory, readLock } from './lock.ts'
import type { EntryTable } from './rewrite.ts'
import { entryTable, toPackageSpecifiers } from './rewrite.ts'

/** The library plugins that move, by folder, and the package each is installed as. */
export const MOVED_PLUGINS: ReadonlyMap<string, string> = new Map([
  ['desktop', '@acryldev/desktop-shell'],
  ['instance', '@acryldev/instance'],
])

/** The version this release installs of each moved package (kept equal to the workspace packages by a test). */
export const DESKTOP_PACKAGE_VERSIONS: Readonly<Record<string, string>> = {
  '@acryldev/desktop-shell': '0.1.0',
  '@acryldev/instance': '0.1.0',
}

/** Whether a file of a carried copy is exactly what some release of the library shipped (the lock's record or the library history). */
export type Pristine = (plugin: string, file: string, hash: string) => boolean

export type DesktopPackagePlan =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'conflict'; readonly files: readonly string[] }
  | {
      readonly kind: 'move'
      /** The copies to remove, as folders under plugins/. */
      readonly remove: readonly string[]
      /** The dependencies to add, exact versions. */
      readonly dependencies: Readonly<Record<string, string>>
      /** The app's files whose imports of the copies become package specifiers, with their new text. */
      readonly rewrites: readonly { readonly file: string; readonly text: string }[]
    }

const SOURCE = /\.(?:ts|tsx|mts|js|mjs)$/u
const SKIPPED = new Set(['node_modules', '.git', '.acryl', 'lib', 'dist'])

function sources(appDir: string, dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sources(appDir, path, out)
    else if (SOURCE.test(entry.name)) out.push(relative(appDir, path).split('\\').join('/'))
  }
  return out
}

/**
 * Plan the move for the app in `appDir`. `table` maps each importable specifier of the moved packages to its file under plugins/
 * (`@acryldev/instance/storage` -> `instance/storage.ts`), `versions` the version each package is installed at. A moved plugin the app does
 * not carry is skipped; an app carrying neither has nothing to do.
 */
export function planDesktopPackage(
  appDir: string,
  table: EntryTable,
  versions: Readonly<Record<string, string>>,
  pristine: Pristine,
): DesktopPackagePlan {
  const carried = [...MOVED_PLUGINS.keys()].filter((name) =>
    existsSync(join(appDir, 'plugins', name)),
  )
  if (carried.length === 0) return { kind: 'nothing' }
  const edited = carried.flatMap((name) =>
    Object.entries(hashFolder(join(appDir, 'plugins', name)))
      .filter(([file, hash]) => !pristine(name, file, hash))
      .map(([file]) => `plugins/${name}/${file}`),
  )
  if (edited.length > 0) return { kind: 'conflict', files: edited }
  const moved = new Set(carried)
  const rewrites = [
    ...sources(appDir, join(appDir, 'src'), []),
    ...sources(appDir, join(appDir, 'scripts'), []),
    ...sources(appDir, join(appDir, 'plugins'), []).filter(
      (file) => !moved.has(file.split('/')[1] ?? ''),
    ),
  ].flatMap((file) => {
    const before = readFileSync(join(appDir, file), 'utf8')
    const after = toPackageSpecifiers(before, file, table, moved)
    return after === before ? [] : [{ file, text: after }]
  })
  const dependencies: Record<string, string> = {}
  for (const name of carried) {
    const pkg = MOVED_PLUGINS.get(name) as string
    const version = versions[pkg]
    if (version === undefined)
      throw new Error(`no version for ${pkg}: it must be published before an app can install it`)
    dependencies[pkg] = version
  }
  return { kind: 'move', remove: carried.map((name) => `plugins/${name}`), dependencies, rewrites }
}

/**
 * `acrylblends upgrade --desktop-packages`: plan the move, report it, and unless `dryRun` apply it - the copies are saved under
 * `.acryl/upgrade-backup/` before they are removed. Returns the exit code.
 */
export function upgradeDesktopPackages(
  appDir: string,
  options: { readonly dryRun: boolean },
  io: Io,
  versions: Readonly<Record<string, string>> = DESKTOP_PACKAGE_VERSIONS,
): number {
  const library = readLibrary()
  const names = new Set(
    [...MOVED_PLUGINS.keys()].map((name) => library.get(name)?.packageName ?? name),
  )
  const table: EntryTable = new Map(
    [...entryTable(library)].filter(([specifier]) =>
      [...names].some((name) => specifier === name || specifier.startsWith(`${name}/`)),
    ),
  )
  const lock = readLock(join(appDir, 'plugins'))
  const history = readHistory()
  const pristine: Pristine = (plugin, file, hash) =>
    lock.plugins[plugin]?.files?.[file] === hash ||
    (history[plugin]?.[file]?.includes(hash) ?? false)
  const plan = planDesktopPackage(appDir, table, versions, pristine)
  if (plan.kind === 'nothing') {
    io.stdout.write(
      'desktop packages: the app carries no desktop shell or instance copy; nothing to move\n',
    )
    return 0
  }
  if (plan.kind === 'conflict') {
    io.stderr.write(
      `error: the app edited its copy (${plan.files.join(', ')}); it keeps the copy and nothing was changed. Move your change into a plugin of the app, restore the file, and run again\n`,
    )
    return 1
  }
  io.stdout.write(
    `desktop packages: remove ${plan.remove.join(', ')}; add ${Object.entries(plan.dependencies)
      .map(([name, version]) => `${name}@${version}`)
      .join(
        ', ',
      )}; rewrite imports in ${plan.rewrites.length === 0 ? 'no file' : plan.rewrites.map((file) => file.file).join(', ')}\n`,
  )
  if (options.dryRun) return 0
  const backup = join(appDir, '.acryl', 'upgrade-backup', `desktop-packages-${Date.now()}`)
  for (const folder of plan.remove) {
    mkdirSync(dirname(join(backup, folder)), { recursive: true })
    cpSync(join(appDir, folder), join(backup, folder), { recursive: true })
  }
  for (const file of plan.rewrites) writeFileSync(join(appDir, file.file), file.text)
  const manifestFile = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  manifest.dependencies = { ...manifest.dependencies, ...plan.dependencies }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  for (const folder of plan.remove) rmSync(join(appDir, folder), { recursive: true, force: true })
  io.stdout.write(
    `the copies are saved in ${relative(appDir, backup).split('\\').join('/')}/; run npm install\n`,
  )
  return 0
}
