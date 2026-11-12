// Where the launcher's lists come from on a real machine: the apps in a folder, an app's own plugins, and the Blends in the public registry.
// Only reads: nothing here writes, spawns or changes anything.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** What makes a folder an app: the Blend manifest create-acrylblends writes at its root. */
export const APP_MARKER = 'blend.yaml'
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

/** An app's own plugins: its plugin folders that the library (plugins/library.lock.json) did not put there. */
export function listPlugins(cwd, app) {
  const root = join(cwd, app, 'plugins')
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
  return {
    exists: path => existsSync(resolve(cwd, path)),
    listApps: () => listApps(cwd),
    listPlugins: app => listPlugins(cwd, app),
    // Read once per launcher run: going back and forth does not fetch again.
    listBlends: () => (blends ??= listBlends(options)),
  }
}
