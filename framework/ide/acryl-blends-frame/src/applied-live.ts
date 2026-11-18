/**
 * Which changes of an app's files the running app has already applied itself, so the frame does not load its code again for them (spec 049 T022).
 *
 * A pull (`plugin pull`, the door's or the frame's) installs a plugin live: it writes `plugins/<name>/`, remembers the release in `blend.yaml` (the
 * `plugin-share` row's `pulled` config) and the plugin runs at once. Loading the whole app again for those writes restarts every app row for seconds,
 * and a second pull made meanwhile is cut off. The files themselves say which writes those were, so this needs no timer and no event:
 *
 * - `plugins/<name>/` that digests to the digest of its pull is the released plugin as pulled. An edit changes the digest, so an agent editing a pulled
 *   plugin still has the app loaded again. The digest is the one `blend.yaml` remembers or, for a pull `blend.yaml` does not remember (from a local
 *   file), the one the running `pluginShare` installed.
 * - `plugins/<name>/` that is gone and was not there when the app's code was last loaded came and went live (a refused pull, a plugin removed live).
 * - `blend.yaml` that differs only in the pulled records changes no row.
 *
 * Anything else, every change of `src/` among it, has the app loaded again, as before.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { digestFolder } from '@webboxes/blends-core'
import { parseDocument } from 'yaml'
import { watchFolder, watchFolders } from './app-reload.ts'

/** The row whose config remembers the pulled plugins (acrylblends' `plugin-share`). */
const SHARE_ROW = 'plugin-share'

/** `blend.yaml` read for this decision: the app without its pulled records, and the digest remembered for each pulled plugin. */
export interface AppDefinition {
  /** The definition with the pulled records taken out, as canonical JSON: equal when no row, order or config other than those changed. */
  readonly app: string
  /** The content digest (sha256 hex) remembered for each pulled plugin, by name. */
  readonly pulled: Readonly<Record<string, string>>
}

/** `blend.yaml`'s text as an {@link AppDefinition}. A text that does not parse is its own definition, so any change to it loads the app again. */
export function readDefinition(text: string): AppDefinition {
  const document = parseDocument(text)
  if (document.errors.length > 0) return { app: text, pulled: {} }
  const value: unknown = document.toJS()
  const rows = (value as { spec?: { rows?: unknown } } | null)?.spec?.rows
  const pulled: Record<string, string> = {}
  if (Array.isArray(rows)) {
    for (const row of rows as Array<{ name?: unknown, config?: Record<string, unknown> } | null>) {
      if (row?.name !== SHARE_ROW || typeof row.config !== 'object' || row.config === null) continue
      const records = row.config.pulled
      if (typeof records === 'object' && records !== null) {
        for (const [name, record] of Object.entries(records as Record<string, { digest?: unknown } | null>))
          if (typeof record?.digest === 'string') pulled[name] = record.digest
      }
      delete row.config.pulled
      if (Object.keys(row.config).length === 0) delete row.config
    }
  }
  return { app: JSON.stringify(value), pulled }
}

/** The folders of `plugins/` now. */
function pluginFolders(root: string): ReadonlySet<string> {
  const dir = join(root, 'plugins')
  if (!existsSync(dir)) return new Set()
  return new Set(readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name))
}

/** The digest a running app's pull installed, by plugin name; undefined when it pulled no plugin of that name (or is not running). */
export type PulledDigest = (name: string) => string | undefined

/** The app's files as its code was last loaded, and the decision for each burst of changes after it. */
export class AppliedLive {
  private definition: string
  private folders: ReadonlySet<string>

  /** `root` is the app's folder; the state is read now, as the app's code was loaded at start. `pulledDigest` answers for a pull `blend.yaml` does not remember. */
  constructor(private readonly root: string, private readonly pulledDigest: PulledDigest = () => undefined) {
    this.definition = this.read().app
    this.folders = pluginFolders(root)
  }

  /** The app's code is being loaded again from the files as they are now: they are the new reference. */
  loaded(): void {
    this.definition = this.read().app
    this.folders = pluginFolders(this.root)
  }

  /**
   * Whether the app's code must be loaded again for these changed paths (absolute, as the watcher reports them). `false` when the running app has
   * applied every one of them itself; the pulled-records-only `blend.yaml` then becomes the reference.
   */
  needsReload(changed: readonly string[]): boolean {
    const now = this.read()
    for (const path of changed) {
      const parts = relative(this.root, path).split(sep)
      if (parts.length === 1 && parts[0] === 'blend.yaml') {
        if (now.app !== this.definition) return true
        continue
      }
      const name = parts[0] === 'plugins' ? parts[1] : undefined
      if (name === undefined || name === '') return true
      const dir = join(this.root, 'plugins', name)
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        const remembered = now.pulled[name] ?? this.pulledDigest(name)
        if (remembered === undefined || digestFolder(dir) !== remembered) return true
      } else if (this.folders.has(name)) return true
    }
    this.definition = now.app
    return false
  }

  private read(): AppDefinition {
    const file = join(this.root, 'blend.yaml')
    return readDefinition(existsSync(file) ? readFileSync(file, 'utf8') : '')
  }
}

/**
 * Watches the app's files - `src/`, `plugins/` and the `blend.yaml` at its root - and calls `reload` for a burst of changes the running app has not
 * applied itself. A decision that cannot read a file (it went away meanwhile) is reported and loads the app again, as without the decision.
 * @returns the function that stops watching.
 */
export function watchAppFiles(
  root: string,
  reload: () => void,
  options: { readonly debounceMs?: number; readonly report?: (cause: unknown) => void; readonly pulledDigest?: PulledDigest } = {},
): () => void {
  const applied = new AppliedLive(root, options.pulledDigest)
  const onChange = (changed: readonly string[]): void => {
    try {
      if (!applied.needsReload(changed)) return
      applied.loaded()
    } catch (cause) {
      options.report?.(cause)
    }
    reload()
  }
  const watching = { ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }), ...(options.report === undefined ? {} : { report: options.report }) }
  const stopCode = watchFolders([join(root, 'src'), join(root, 'plugins')], onChange, watching)
  const stopBlend = watchFolder(root, onChange, { ...watching, only: ['blend.yaml'] })
  return () => {
    stopCode()
    stopBlend()
  }
}

/**
 * The running app's `pluginShare` as the frame reads it: its `pulledDigest`, when the service is there and has one. Read at each call, as the app's rows
 * come and go with a reload; anything else answers undefined, so the decision falls back to `blend.yaml` alone.
 */
export function pulledDigestOf(service: () => unknown): PulledDigest {
  return (name) => {
    const share = service() as { pulledDigest?: unknown } | undefined
    if (typeof share?.pulledDigest !== 'function') return undefined
    const digest: unknown = (share.pulledDigest as (name: string) => unknown).call(share, name)
    return typeof digest === 'string' ? digest : undefined
  }
}
