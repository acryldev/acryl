/**
 * The app's own plugins: the folders of `plugins/` that are not library copies (`plugins/library.json` lists those). A feature is one of them, and
 * `blend.yaml` mounts it with a row of its own (`- id: notes` / `name: notes`), with no import in `src/app.ts`: a row whose name the static registry
 * does not have resolves to the folder of that name here. So `blend.yaml` plus `plugins/` is the whole composition, and a version, a shared app or a
 * blueprint made from the folder starts the same plugins.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The file a plugin folder starts from, in the order they are looked for. */
export const PLUGIN_ENTRIES = ['index.ts', 'index.js', 'index.mjs'] as const
/** A plugin's name: its folder's name and its Loader row id. */
const NAME = /^[a-z0-9][a-z0-9-]*$/

/** The library copies a plugins folder holds (`library.json`, written by `acrylblends add`); absent or unreadable means none. */
export function libraryCopies(dir: string): ReadonlySet<string> {
  try {
    const listed = (
      JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8')) as { plugins?: unknown }
    ).plugins
    return new Set(
      Array.isArray(listed)
        ? listed.filter((name): name is string => typeof name === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

/** The entry file of a plugin folder, or undefined when it has none. */
export function pluginEntry(dir: string): string | undefined {
  return PLUGIN_ENTRIES.map((file) => join(dir, file)).find((path) => existsSync(path))
}

/** The names of the app's own plugins in `dir` (the app's `plugins/`): folders with an entry file that are not library copies, sorted. */
export function appPluginNames(dir: string): string[] {
  if (!existsSync(dir)) return []
  const library = libraryCopies(dir)
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        NAME.test(entry.name) &&
        !library.has(entry.name) &&
        pluginEntry(join(dir, entry.name)) !== undefined,
    )
    .map((entry) => entry.name)
    .sort()
}

/** A plugin module as a row mounts it. */
export interface AppPluginModule {
  readonly name: string
  readonly apply: (...args: never[]) => unknown
}

/**
 * Import the app's own plugins `names` from `dir`, each checked to be a Cordis plugin whose `name` is its folder's.
 * @throws an error that names the folder and the fix, for a folder that does not export a plugin.
 */
export async function loadAppPlugins(
  dir: string,
  names: readonly string[],
): Promise<Record<string, AppPluginModule>> {
  const loaded: Record<string, AppPluginModule> = {}
  for (const name of names) {
    const entry = pluginEntry(join(dir, name))
    if (entry === undefined) throw new Error(`plugins/${name} has no ${PLUGIN_ENTRIES.join(', ')}`)
    const module = (await import(pathToFileURL(entry).href)) as Partial<AppPluginModule> & {
      default?: Partial<AppPluginModule>
    }
    const plugin = typeof module.apply === 'function' ? module : module.default
    if (plugin === undefined || typeof plugin.apply !== 'function')
      throw new Error(
        `plugins/${name}/${basename(entry)} must export a Cordis plugin: export const name = '${name}' and export function apply(ctx) { ... }`,
      )
    if (plugin.name !== undefined && plugin.name !== name)
      throw new Error(
        `plugins/${name} exports the plugin name "${String(plugin.name)}"; a plugin's name is its folder's, "${name}"`,
      )
    loaded[name] = { ...plugin, name } as AppPluginModule
  }
  return loaded
}
