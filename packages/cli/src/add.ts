import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { UsageError } from './init'
import type { Io } from './io'
import {
  closure,
  copyPlugin,
  copyRewritten,
  LEGACY_WARNING,
  type LibraryPlugin,
  libraryRoot,
  PLUGINS_DIR,
  pluginsFolder,
  readLibrary,
} from './library'
import { MOUNTED, type Mounted, missingRows, mount, rowNames } from './mount'
import {
  appendGitignore,
  mergeDependencies,
  mergeImports,
  mergeOpener,
  mergeTooling,
} from './project'

export interface AddOptions {
  readonly names: readonly string[]
  readonly directory: string | undefined
  /** Also copy the port's conformance suite (`src/conformance.ts`) and the `vitest` it runs on: what a provider of your own must pass. */
  readonly suite: boolean
}

/** Parse `add <plugin...> [--dir <app>] [--suite]`. */
export function parseAddOptions(argv: readonly string[]): AddOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  if (parsed.positionals.length === 0)
    throw new UsageError('add needs at least one plugin name (see "acrylblends plugins")')
  return {
    names: parsed.positionals,
    directory: parsed.values.dir,
    suite: parsed.values.suite === true,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { dir: { type: 'string' }, suite: { type: 'boolean' } },
  })

/** The plugins whose rows only the agent template has. */
const AGENT_ROWS = ['agent-panel', 'driver-pty', 'driver-acp']

const present = (appDir: string, name: string) => existsSync(join(pluginsFolder(appDir).dir, name))

/**
 * Copy library plugins into an existing app, with the plugins they require, and add their npm packages to its package.json.
 * Refuses a plugin the app already has. Returns the exit code.
 */
export async function add(options: AddOptions, io: Io): Promise<number> {
  const appDir = resolve(io.cwd, options.directory ?? '.')
  if (!existsSync(join(appDir, 'package.json')) || !existsSync(join(appDir, 'src'))) {
    io.stderr.write(
      `error: ${appDir} is not an app (no package.json and src/); run "acrylblends init" first\n`,
    )
    return 1
  }
  if (pluginsFolder(appDir).legacy) io.stderr.write(`${LEGACY_WARNING}\n`)
  // A path is an external plugin folder; anything else is a library plugin name.
  const external = options.names.filter((name) => /[\\/]/.test(name) || name.startsWith('.'))
  for (const folder of external) {
    const code = addExternal(resolve(io.cwd, folder), appDir, io)
    if (code !== 0) return code
  }
  // The desktop shell has two forms: the Blend app (it needs the `instance` plugin) and a plain Acryl app (`export default app`); `desktop` means the one that fits.
  // A Blend app has a blend.yaml (an older one at least its instance plugin). A plain app may have the instance plugin too, when desktop-web brought it.
  const folder = pluginsFolder(appDir).dir
  const plain =
    !existsSync(join(appDir, 'blend.yaml')) &&
    (!existsSync(join(folder, 'instance')) || existsSync(join(folder, 'desktop-web')))
  if (plain && options.names.includes('db')) {
    io.stderr.write(
      'error: "db" is the Cordis plugin for a Blend app. A plain Acryl app opens its database with openDb from "acrylblends/db/sqlite" (see docs/framework/guides/data.md)\n',
    )
    return 1
  }
  if (plain && options.names.includes('kv')) {
    io.stderr.write(
      'error: "kv" is the Cordis plugin for a Blend app. A plain Acryl app opens its store with openKv from "acrylblends/kv/json" (see docs/framework/guides/data.md#a-tiny-app-kv)\n',
    )
    return 1
  }
  const names = options.names
    .filter((name) => !external.includes(name))
    // `db` is the SQLite provider of the db port (it brings the port); a plain app opens its database with `acrylblends/db/sqlite` instead.
    .map((name) => (name === 'db' ? 'acryl-db-sqlite' : name))
    // `kv` is the JSON-file provider of the kv port (it brings the port); `acryl-kv-db` is the one over db.
    .map((name) => (name === 'kv' ? 'acryl-kv-json' : name))
    .map((name) => (name === 'desktop' && plain ? 'desktop-web' : name))
  if (names.length === 0) return 0
  const already = options.suite ? [] : names.filter((name) => present(appDir, name))
  if (already.length > 0) {
    io.stderr.write(
      `error: the app already has ${already
        .map(
          (name) =>
            `${relative(appDir, join(pluginsFolder(appDir).dir, name))
              .split(sep)
              .join('/')}`,
        )
        .join(', ')}\n`,
    )
    return 1
  }
  // The agent panel and the PTY driver cannot run without the rows of the agent template: refuse before anything is copied, and say exactly what is missing.
  const mounting = MOUNTED.filter((plugin) => names.includes(plugin.name))
  for (const plugin of mounting) {
    const missing = missingRows(appDir, plugin, names)
    if (missing.length > 0) {
      io.stderr.write(
        `error: ${plugin.name} needs the ${missing.map((row) => `\`${row}\``).join(' and ')} ${missing.length === 1 ? 'row' : 'rows'} in blend.yaml, and this app has ${describeRows(appDir)}. ` +
          `${plugin.name === 'driver-pty' ? 'Add agent-panel first (acrylblends add agent-panel driver-pty), which needs the agent template. ' : ''}` +
          `${AGENT_ROWS.includes(plugin.name) ? `The rows come with the agent template: start from it (npm create acrylblends@latest my-app agent) and add ${plugin.name} there. ` : ''}Nothing was changed.\n`,
      )
      return 1
    }
  }
  const toCopy: LibraryPlugin[] = closure(names, readLibrary()).filter(
    (plugin) => !present(appDir, plugin.name),
  )
  const addedDependencies: string[] = []
  for (const plugin of toCopy) {
    copyPlugin(plugin, appDir)
    if (plugin.imports)
      mergeImports(
        appDir,
        plugin.imports,
        relative(appDir, pluginsFolder(appDir).dir).split(sep).join('/'),
      )
    addedDependencies.push(...mergeDependencies(appDir, plugin.dependencies))
    const tooling = mergeTooling(appDir, plugin)
    appendGitignore(appDir, plugin.gitignore)
    // The provider is mounted from src/app.ts, which is therefore the one file that may import it (`acrylblends check-deps`).
    if (plugin.name === 'acryl-db-sqlite') mergeOpener(appDir, 'src/app.ts')
    addedDependencies.push(...tooling.devDependencies)
    if (tooling.scripts.length > 0)
      io.stdout.write(
        `new scripts: ${tooling.scripts.map((name) => `npm run ${name}`).join(', ')}\n`,
      )
  }
  if (options.suite) {
    const refused = copySuites(names, appDir, addedDependencies, io)
    if (refused !== 0) return refused
  }
  io.stdout.write(`added ${toCopy.map((plugin) => plugin.name).join(', ')} to ${appDir}\n`)
  if (addedDependencies.length > 0)
    io.stdout.write(`dependencies to install: ${addedDependencies.join(', ')} (run npm install)\n`)
  for (const plugin of toCopy.filter((plugin) => names.includes(plugin.name))) {
    const mounted = MOUNTED.find((candidate) => candidate.name === plugin.name)
    const result = mounted ? mount(appDir, mounted) : undefined
    io.stdout.write(
      `\n${plugin.name}: ${result?.done ? `${result.note}${extraNote(mounted)}` : `${result ? `${result.note}\n` : ''}${plugin.mount ?? `import it from '../plugins/${plugin.name}/index.ts' and mount it in src/app.ts`}`}\n`,
    )
  }
  return 0
}

/** What an app has to say about its rows, for an error: the `name:` of each, or that it has no blend.yaml. */
function describeRows(appDir: string): string {
  const rows = rowNames(appDir)
  return rows === undefined ? 'no blend.yaml' : `the rows ${rows.join(', ') || '(none)'}`
}

/** What to do after `npm install` for a plugin that needs more than the install: node-pty compiles a native module in an install script, which npm 11 and pnpm skip until approved. */
function extraNote(plugin: Mounted | undefined): string {
  return plugin?.name === 'driver-pty'
    ? "\nnpm 11 and pnpm warn that node-pty's install script was not run, because they ask you to approve dependency install scripts. node-pty ships prebuilt binaries for macOS, Windows and Linux (x64, arm64), so you can usually ignore the warning. If the panel lists no `pty:` terminal (the app prints why at start), approve it and rebuild: `npm approve-scripts node-pty`, then `npm rebuild node-pty` (pnpm: `pnpm approve-builds`)."
    : ''
}

/**
 * The vitest the suites run on. 3.2.x, not the newest: npm 10 (the npm of Node 22) crashes on the dependency tree of vitest 4 and 5 ("Cannot read properties of null (reading
 * 'edgesOut')"), and the suites use only `describe`, `it` and `expect`, which are the same in all of them. An app on a newer npm may raise it.
 */
const SUITE_RUNNER = { vitest: '3.2.4' }

/**
 * Copy the conformance suite of each named port next to its source (`plugins/<name>/src/conformance.ts`), and add `vitest` to the app's development
 * dependencies. The suite is left out of a normal copy because an app that only uses a port has no use for it. Returns the exit code: 1 when a plugin has none.
 */
function copySuites(names: readonly string[], appDir: string, added: string[], io: Io): number {
  const copies: Array<{ from: string; to: string }> = []
  // The suite belongs to the port: `add kv --suite` (acryl-kv-json, or acryl-kv-db) brings the suite of acryl-kv.
  const ports = [
    ...new Set(names.map((name) => name.replace(/^(acryl-(?:kv|db))(?:-.*)?$/u, '$1'))),
  ]
  const library = readLibrary()
  for (const name of ports) {
    const suite = library.get(name)?.suite
    const from = suite === undefined ? '' : join(libraryRoot(), name, suite)
    if (suite === undefined || !existsSync(from)) {
      io.stderr.write(`error: ${name} has no conformance suite (the ports db and kv do)\n`)
      return 1
    }
    copies.push({ from, to: join(pluginsFolder(appDir).dir, name, suite) })
  }
  for (const { from, to } of copies) {
    mkdirSync(dirname(to), { recursive: true })
    copyRewritten(from, to, pluginOf(to), suiteOf(to))
    io.stdout.write(`added the conformance suite ${relative(appDir, to).split(sep).join('/')}\n`)
  }
  added.push(...mergeTooling(appDir, { devDependencies: SUITE_RUNNER }).devDependencies)
  return 0
}

/** The plugin folder name and the file inside it, from a path below the plugins folder (`.../plugins/acryl-kv/src/conformance.ts`). */
const pluginOf = (path: string): string => path.split(sep).slice(-3, -2)[0] ?? ''
const suiteOf = (path: string): string => path.split(sep).slice(-2).join('/')

const PLUGIN_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Bring an external plugin folder (a package made with the builder's package_plugin, or any folder with an index.ts that exports a
 * Cordis plugin) into the app's `plugins/`, where the extensions plugin installs it like any other: checked, staged, started,
 * verified. Its runtime dependencies are not installed here; they are reported so the user adds them deliberately.
 */
function addExternal(folder: string, appDir: string, io: Io): number {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    io.stderr.write(`error: ${folder} is not a folder\n`)
    return 1
  }
  if (!['index.ts', 'index.js', 'index.mjs'].some((entry) => existsSync(join(folder, entry)))) {
    io.stderr.write(`error: ${folder} has no index.ts that exports a Cordis plugin\n`)
    return 1
  }
  const manifestFile = join(folder, 'package.json')
  const manifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as {
        name?: string
        dependencies?: Record<string, string>
      })
    : {}
  const name = (manifest.name ?? basename(folder)).replace(/^@[^/]+\//, '')
  if (!PLUGIN_NAME.test(name)) {
    io.stderr.write(
      `error: "${name}" is not a plugin name (lowercase letters, digits and dashes)\n`,
    )
    return 1
  }
  const target = join(
    pluginsFolder(appDir).legacy ? join(appDir, 'extensions') : join(appDir, PLUGINS_DIR),
    name,
  )
  if (existsSync(target)) {
    io.stderr.write(`error: the app already has ${relative(appDir, target).split(sep).join('/')}\n`)
    return 1
  }
  cpSync(folder, target, {
    recursive: true,
    filter: (path) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(path.slice(folder.length)),
  })
  io.stdout.write(
    `added external plugin ${name} to ${dirname(target)}; it installs at the next start\n`,
  )
  const dependencies = Object.keys(manifest.dependencies ?? {})
  if (dependencies.length > 0)
    io.stdout.write(
      `it uses ${dependencies.join(', ')}: add them to the app with npm install first\n`,
    )
  return 0
}

/** `acrylblends plugins`: the library, one line per plugin. */
export function listPlugins(io: Io): number {
  for (const plugin of readLibrary().values()) {
    const requires = plugin.requires.length > 0 ? ` (requires ${plugin.requires.join(', ')})` : ''
    io.stdout.write(`${plugin.name.padEnd(12)} ${plugin.description}${requires}\n`)
  }
  return 0
}
