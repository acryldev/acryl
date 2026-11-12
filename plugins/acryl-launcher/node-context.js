// Where the launcher's lists come from on a real machine: the apps in a folder, an app's own plugins, and the Blends in the public registry.
// Only reads: nothing here writes, spawns or changes anything.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { APP_MARKER, inspectApp, readApps } from './apps-registry.js'

export { APP_MARKER }
/** The public registry's index (create-acrylblends PUBLIC_REGISTRY). */
export const REGISTRY_INDEX = 'https://acrylblends.github.io/registry/index.json'

const isApp = dir => existsSync(join(dir, APP_MARKER))
const folders = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name) } catch { return [] }
}

/** The apps at `cwd`: the folder itself when it is one (value '.'), and every folder in it that is one. */
export function listApps(cwd) {
  const apps = []
  if (isApp(cwd)) apps.push({ value: '.', label: basename(resolve(cwd)), description: 'this folder' })
  for (const name of folders(cwd).sort()) if (isApp(join(cwd, name))) apps.push({ value: name, label: name })
  return apps
}

/**
 * Every app a person can choose: the ones in the list (value = the app's whole path, so any command runs in the right folder) and the ones in the
 * folder the launcher started in that are not listed yet.
 */
export function listAllApps(cwd, home) {
  const listed = home ? readApps(home).filter(entry => inspectApp(entry).state === 'ready').map(entry => ({
    value: entry.path, label: entry.id, description: `${entry.blend || 'Blend'}  ${entry.path}`,
  })) : []
  const known = new Set(listed.map(entry => resolve(entry.value)))
  const local = listApps(cwd).filter(entry => !known.has(resolve(cwd, entry.value)))
  return [...listed, ...local]
}

/** An app's own plugins: its plugin folders that the library (plugins/library.lock.json) did not put there. */
export function listPlugins(cwd, app) {
  const root = join(resolve(cwd, app), 'plugins')   // an app from the list is a whole path, one in this folder a name
  let library = {}
  try { library = JSON.parse(readFileSync(join(root, 'library.lock.json'), 'utf8')).plugins ?? {} } catch {}
  return folders(root).filter(name => !(name in library)).sort().map(name => ({ value: name, label: name }))
}

/** The Blends `acryl new --from` can make (registry entries for runtime acrylblends), by name; empty when the registry cannot be read. */
export async function listBlends({ fetch = globalThis.fetch, url = REGISTRY_INDEX, timeoutMs = 10_000 } = {}) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return []
    const { entries = [] } = await response.json()
    return entries
      .filter(entry => entry.runtime === 'acrylblends' && typeof entry.id === 'string')
      .map(entry => ({ value: entry.id, label: entry.name ?? entry.id, description: entry.description ?? '' }))
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

/** The context a session needs, for the folder the launcher started in. */
export function nodeContext(cwd = process.cwd(), options = {}) {
  let blends
  const { home } = options
  return {
    exists: path => existsSync(resolve(cwd, path)),
    listApps: () => listAllApps(cwd, home),
    // The list as the home screen shows it (state: ready or missing); empty without a home.
    registeredApps: () => (home ? readApps(home).map(entry => ({ ...entry, ...inspectApp(entry) })) : []),
    // Where a new app goes unless the person says otherwise (spec 050 D8): a visible folder, never ACRYL's hidden one.
    defaultAppsFolder: () => options.appsFolder ?? '.',
    home,
    listPlugins: app => listPlugins(cwd, app),
    // Read once per launcher run: going back and forth does not fetch again.
    listBlends: () => (blends ??= listBlends(options)),
  }
}
