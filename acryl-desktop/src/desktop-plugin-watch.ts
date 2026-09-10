/**
 * Local-development plugin auto-reload.
 *
 * `ACRYL_PLUGIN_WATCH=<package>=<abs dir>[,<package>=<abs dir>]` makes the
 * desktop Host watch each checkout directory and restart that plugin's fiber
 * on change - the Pi `/reload` loop for a plugin you are actively editing.
 * Off by default; the directories are operator-supplied, never derived from
 * untrusted input. A rebuild that produces a broken module surfaces as a
 * FAILED fiber in the Lifecycle tab, not a Host crash.
 */

import { watch, type FSWatcher } from 'node:fs'
import { isAbsolute } from 'node:path'

const DEBOUNCE_MS = 150

export interface PluginWatchTarget {
  readonly packageName: string
  readonly directory: string
}

/** Parse the `ACRYL_PLUGIN_WATCH` spec. Malformed pairs are dropped, not fatal. */
export function parsePluginWatchSpec(value: string | undefined): readonly PluginWatchTarget[] {
  if (value === undefined || value.trim() === '') return []
  const targets: PluginWatchTarget[] = []
  const seen = new Set<string>()
  for (const pair of value.split(',')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const packageName = pair.slice(0, eq).trim()
    const directory = pair.slice(eq + 1).trim()
    if (packageName === '' || directory === '' || !isAbsolute(directory) || seen.has(packageName)) continue
    seen.add(packageName)
    targets.push({ packageName, directory })
  }
  return targets
}

/**
 * Start the watchers. Returns a disposer. `reload` is
 * `PluginLifecycleController.reloadByPackage`; `onError` reports a failed
 * reload without tearing anything down.
 */
export function installPluginWatchers(
  targets: readonly PluginWatchTarget[],
  reload: (packageName: string) => Promise<unknown>,
  onError: (packageName: string, cause: unknown) => void,
  createWatcher: (dir: string, listener: () => void) => FSWatcher =
    (dir, listener) => watch(dir, { recursive: true }, () => { listener() }),
): () => void {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, NodeJS.Timeout>()
  for (const { packageName, directory } of targets) {
    const fire = (): void => {
      clearTimeout(timers.get(packageName))
      timers.set(packageName, setTimeout(() => {
        timers.delete(packageName)
        void reload(packageName).catch(cause => { onError(packageName, cause) })
      }, DEBOUNCE_MS))
    }
    try {
      watchers.push(createWatcher(directory, fire))
    } catch (cause) {
      onError(packageName, cause)
    }
  }
  return () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    for (const watcher of watchers) watcher.close()
    watchers.length = 0
  }
}
