/**
 * Where installed versions of a plugin are kept, as the install transaction needs it. The transaction (`index.ts`) owns this port and says nothing about folders,
 * copies or URLs; `stage.ts` is the adapter that keeps them on disk (Clean Architecture: a boundary owned by the use case; the layout is a detail).
 */
import { digestFolder } from '@webboxes/blends-core'

/** One kept version of a plugin. `dir` is what the transaction imports it from. */
export interface StoredPlugin {
  readonly dir: string
  readonly version: string
}

export interface PluginStore {
  /** Keep this source as a version of `name` and return it. An unchanged source returns the version already kept. */
  put(name: string, source: string): StoredPlugin
  /** Whether this version, recorded earlier, is still here. */
  holds(plugin: StoredPlugin): boolean
  /** Drop a version that was refused. */
  discard(plugin: StoredPlugin): void
  /** Drop every version of `name` but `plugin`; all of them when none is given. */
  keepOnly(name: string, plugin?: StoredPlugin): void
  /** Let kept plugins import what the app at `appRoot` provides, until the returned function is called. */
  resolveImportsFrom(appRoot: string): () => void
}

/** A short content digest of a plugin's folder: an unchanged source keeps its version. */
export const pluginVersion = (dir: string): string => digestFolder(dir, 12)
