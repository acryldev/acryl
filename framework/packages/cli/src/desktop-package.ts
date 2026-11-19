/**
 * Spec 051 T011: an app stops carrying its copies of the desktop shell and the instance (`plugins/desktop`, `plugins/instance`) and installs
 * them as packages instead. This module only plans that move for one app; `upgrade` shows the plan and applies it. An app whose copy it
 * edited keeps the copy (a conflict, named file by file): its changes are its own and are never thrown away.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { hashFolder } from './lock.ts'
import type { EntryTable } from './rewrite.ts'
import { toPackageSpecifiers } from './rewrite.ts'

/** The library plugins that move, by folder, and the package each is installed as. */
export const MOVED_PLUGINS: ReadonlyMap<string, string> = new Map([
  ['desktop', '@acryldev/desktop-shell'],
  ['instance', '@acryldev/instance'],
])

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
