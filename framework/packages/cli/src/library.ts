import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFolder, recordLock } from './lock'
import { type EntryTable, entryTable, rewriteSpecifiers } from './rewrite'

/** One entry of the plugin library: `plugins/<name>/plugin.json` in this repository. */
export interface LibraryPlugin {
  /** The library name, equal to its folder: what `acrylblends add` takes. */
  readonly name: string
  /** The npm name its workspace package declares (`@acryldev/instance`), which is how the plugins import each other; absent when the plugin has no package.json, and then the name is its own. */
  readonly packageName?: string
  /** The version its workspace package declares: what an app installs of a packaged plugin (PACKAGED). */
  readonly packageVersion?: string
  readonly description: string
  /** Library plugins this one imports; they are copied with it. */
  readonly requires: readonly string[]
  /** npm packages an app needs at run time for this plugin. */
  readonly dependencies: Readonly<Record<string, string>>
  /** npm packages an app needs only to develop or run this plugin's tooling (for example `electron` for the desktop shell). */
  readonly devDependencies?: Readonly<Record<string, string>>
  /** `package.json` scripts the plugin adds; a script the app already has is kept. */
  readonly scripts?: Readonly<Record<string, string>>
  /** Lines the app's `.gitignore` needs for this plugin (added when missing, if the app has a `.gitignore`). */
  readonly gitignore?: readonly string[]
  /** The port's conformance suite, a path inside the plugin: shipped in the package, but copied into an app only by `acrylblends add <plugin> --suite` (it needs vitest). */
  readonly suite?: string
  /** What other library plugins may import from this one: the import name after the plugin's own (`''`, `/middleware`) and the file it stands for. Used to rewrite `acryl-*` imports when a plugin is copied. */
  readonly entries?: Readonly<Record<string, string>>
  /** `package.json` "imports" entries the app gets (`#acryl-kv`): a path below the plugins folder. A plugin of your own imports the port by that name, in tests and the type-check as well as when installed live. */
  readonly imports?: Readonly<Record<string, string>>
  /** How to mount it, shown after `acrylblends add`. */
  readonly mount?: string
  /**
   * Paths inside the plugin folder that are not copied into an app (for example a React hook an app without React cannot type-check, or colocated test
   * files). A pattern is an exact path or a glob: `*` matches within one folder name, `**` across folders, `?` one character; `**` followed by a slash also matches no folder.
   */
  readonly omit?: readonly string[]
}

/** A glob as a regular expression: `*` within a name, `**` across folders, `**` plus a slash may match no folder, `?` one character. */
function globToRegExp(glob: string): RegExp {
  let source = ''
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] as string
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        source += '(?:.*/)?'
        i += 2
      } else {
        source += '.*'
        i += 1
      }
    } else if (c === '*') source += '[^/]*'
    else if (c === '?') source += '[^/]'
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

/** Whether a path inside a plugin folder (relative, any separator) is named by one of its `omit` patterns. */
export function isOmitted(inside: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false
  const path = inside.split(sep).join('/')
  return patterns.some((pattern) =>
    /[*?]/.test(pattern) ? globToRegExp(pattern).test(path) : pattern === path,
  )
}

/** Files of a library plugin that stay in the repository: its manifest and its tests. */
const LIBRARY_ONLY = new Set(['plugin.json', 'test', 'tests'])

export class LibraryError extends Error {
  override name = 'LibraryError'
}

/** The library folder (`plugins/` at the repository root): walk up from this module, in source or in the build. */
export function libraryRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const candidate = join(dir, 'plugins')
    if (existsSync(join(candidate, 'instance', 'plugin.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir)
      throw new LibraryError('acrylblends cannot find its plugin library (plugins/)')
    dir = parent
  }
}

/** Every plugin in the library, by name. */
export function readLibrary(root: string = libraryRoot()): Map<string, LibraryPlugin> {
  const plugins = new Map<string, LibraryPlugin>()
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const manifest = join(root, entry.name, 'plugin.json')
    if (!entry.isDirectory() || !existsSync(manifest)) continue
    const plugin = JSON.parse(readFileSync(manifest, 'utf8')) as LibraryPlugin
    if (plugin.name !== entry.name)
      throw new LibraryError(`plugins/${entry.name}/plugin.json names "${plugin.name}"`)
    const packageFile = join(root, entry.name, 'package.json')
    const pkg = existsSync(packageFile)
      ? (JSON.parse(readFileSync(packageFile, 'utf8')) as { name?: unknown; version?: unknown })
      : {}
    const declared = pkg.name
    plugins.set(plugin.name, {
      ...plugin,
      packageName: typeof declared === 'string' && declared.trim() !== '' ? declared : plugin.name,
      ...(typeof pkg.version === 'string' ? { packageVersion: pkg.version } : {}),
      requires: plugin.requires ?? [],
      dependencies: plugin.dependencies ?? {},
    })
  }
  return plugins
}

/**
 * The library plugins an app installs as their npm package instead of a copy (spec 051 T011): where the app keeps things and the desktop shell are
 * the same in every app, so the app and every plugin it copies import them by package name, and an update is a version bump, not a re-copy.
 */
export const PACKAGED: ReadonlySet<string> = new Set(['instance', 'desktop-shell'])

/** The dependency an app gets instead of a copy of `plugin` (its exact workspace version), or undefined for a plugin that is copied. */
export function packagedDependency(plugin: LibraryPlugin): Record<string, string> | undefined {
  if (!PACKAGED.has(plugin.name)) return undefined
  if (plugin.packageName === undefined || plugin.packageVersion === undefined)
    throw new LibraryError(
      `plugins/${plugin.name} is installed as a package but has no package.json name and version`,
    )
  return { [plugin.packageName]: plugin.packageVersion }
}

/** The plugins to copy for `names`: each one after everything it requires, no duplicates. */
export function closure(
  names: readonly string[],
  library: ReadonlyMap<string, LibraryPlugin>,
): LibraryPlugin[] {
  const ordered: LibraryPlugin[] = []
  const visiting = new Set<string>()
  const visit = (name: string, trail: string[]) => {
    if (ordered.some((plugin) => plugin.name === name)) return
    const plugin = library.get(name)
    if (!plugin)
      throw new LibraryError(
        `no plugin "${name}" in the library${trail.length ? ` (required by ${trail.at(-1)})` : ''}`,
      )
    if (visiting.has(name))
      throw new LibraryError(
        `plugins require each other in a cycle: ${[...trail, name].join(' -> ')}`,
      )
    visiting.add(name)
    for (const required of plugin.requires) visit(required, [...trail, name])
    visiting.delete(name)
    ordered.push(plugin)
  }
  for (const name of names) visit(name, [])
  return ordered
}

/** The one folder every plugin of an app lives in, library copies and the ones an agent writes. */
export const PLUGINS_DIR = 'plugins'
/** Where apps made before 0.7.8 kept library copies; still understood for one release. */
export const LEGACY_PLUGINS_DIR = join('src', 'plugins')
/** The list of library copies in the plugins folder; the extensions plugin installs every other folder there. */
export const LIBRARY_LIST = 'library.json'

/** The plugins folder of an app: `plugins/`, or `src/plugins/` for an app that still has the old layout (and no `plugins/`). */
export function pluginsFolder(appDir: string): { dir: string; legacy: boolean } {
  const legacy =
    existsSync(join(appDir, LEGACY_PLUGINS_DIR)) && !existsSync(join(appDir, PLUGINS_DIR))
  return { dir: join(appDir, legacy ? LEGACY_PLUGINS_DIR : PLUGINS_DIR), legacy }
}

/** The warning for an app with the old layout. */
export const LEGACY_WARNING =
  'warning: this app keeps its plugins in src/plugins/ (and extensions/); plugins now live in one folder, plugins/. Move them with "git mv src/plugins plugins", fix the paths in tsconfig.json, package.json and src/, and see docs/framework/agents/index.md. The old layout is read for this release only.'

/** List `name` among the library copies of a plugins folder (`library.json`). */
export function recordLibraryCopy(folder: string, name: string): void {
  const file = join(folder, LIBRARY_LIST)
  const names: string[] = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { plugins: string[] }).plugins
    : []
  if (!names.includes(name)) names.push(name)
  writeFileSync(file, `${JSON.stringify({ plugins: names.sort() }, null, 2)}\n`)
}

/** Files at a plugin's root that are the repository's or the package manager's, never the app's. */
const PACKAGE_ONLY = new Set([
  'package.json',
  'node_modules',
  'lib',
  'dist',
  '.git',
  // The package's build, not the app's copy of its source.
  'scripts',
  'tsdown.config.ts',
  'tsconfig.json',
])

/** Copy one library plugin's source into `<app>/plugins/<name>/`. Throws when that folder already exists. */
export function copyPlugin(
  plugin: LibraryPlugin,
  appDir: string,
  root: string = libraryRoot(),
): string {
  const folder = pluginsFolder(appDir)
  const target = join(folder.dir, plugin.name)
  if (existsSync(target))
    throw new LibraryError(
      `${relativeName(appDir, target)} already exists; remove it first to copy a fresh one`,
    )
  const source = join(root, plugin.name)
  // A framework package (it has a package.json in the repository) is copied as its source: a plugin whose entry lives in `src/` (the vendored ones) contributes `src/` and the
  // licence, the app plugins keep their files at the folder root. The package's `plugin.json` lists `entries`, and the imports of such a plugin are rewritten to relative paths,
  // in the repository and in the installed package alike.
  const isPackage = existsSync(join(source, 'package.json'))
  const inSourceDir = (plugin.entries?.[''] ?? 'index.ts').startsWith('src/')
  const library = plugin.entries === undefined ? undefined : readLibrary(root)
  const entries = library === undefined ? undefined : entryTable(library)
  cpSync(source, target, {
    recursive: true,
    filter: (path) => {
      const inside = path
        .slice(source.length + 1)
        .split(sep)
        .join('/')
      if (isPackage && inSourceDir) {
        if (inside !== '' && inside !== 'LICENSE' && inside !== 'src' && !inside.startsWith('src/'))
          return false
      } else if (isPackage && inside !== '' && PACKAGE_ONLY.has(inside.split('/')[0] ?? '')) {
        return false
      }
      return (
        !(dirname(path) === source && LIBRARY_ONLY.has(inside)) &&
        !isOmitted(inside, plugin.omit) &&
        inside !== plugin.suite
      )
    },
  })
  if (entries) {
    // A package the plugin lists as a dependency is installed in the app, so its specifier stays a package specifier (spec 051 T011/T038).
    // So is a packaged plugin (PACKAGED): the app installs it instead of a copy.
    const installed = new Set([
      ...Object.keys(plugin.dependencies),
      ...[...PACKAGED].flatMap((name) => library?.get(name)?.packageName ?? []),
    ])
    if (inSourceDir) rewriteTree(join(target, 'src'), plugin.name, 'src', entries, installed)
    else rewriteTree(target, plugin.name, '', entries, installed)
  }
  if (!folder.legacy) {
    recordLibraryCopy(folder.dir, plugin.name)
    // The hashes of the files as copied: `acrylblends upgrade` tells an untouched file from an edited one by them.
    recordLock(folder.dir, plugin.name, hashFolder(target))
  }
  return target
}

/** Rewrite the `acryl-*` imports of every TypeScript file below `dir` (the plugin's `src/`) to relative paths. */
function rewriteTree(
  dir: string,
  plugin: string,
  inside: string,
  entries: EntryTable,
  installed: ReadonlySet<string>,
): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory())
      rewriteTree(path, plugin, `${inside}/${entry}`, entries, installed)
    else if (/\.(?:ts|tsx|mts)$/u.test(entry)) {
      const id = inside === '' ? `${plugin}/${entry}` : `${plugin}/${inside}/${entry}`
      writeFileSync(path, rewriteSpecifiers(readFileSync(path, 'utf8'), id, entries, installed))
    }
  }
}

/** Copy one file of a library plugin (a conformance suite) with its `acryl-*` imports rewritten, as `copyPlugin` does for the rest. */
export function copyRewritten(
  from: string,
  to: string,
  plugin: string,
  inside: string,
  root: string = libraryRoot(),
): void {
  const library = readLibrary(root)
  writeFileSync(
    to,
    rewriteSpecifiers(
      readFileSync(from, 'utf8'),
      `${plugin}/${inside}`,
      entryTable(library),
      new Set(Object.keys(library.get(plugin)?.dependencies ?? {})),
    ),
  )
}

const relativeName = (appDir: string, path: string) =>
  path
    .slice(appDir.length + 1)
    .split(sep)
    .join('/')
