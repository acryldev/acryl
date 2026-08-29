/**
 * Plain, Cordis-agnostic snapshot of one loader entry, joined from
 * `ctx.loader.entries()` for the `/plugins` overlay.
 * @module @tomowang/dsh-tui/tui/plugins/types
 */

/** One flattened loader entry, alongside its live fiber lifecycle state. */
export interface PluginRow {
  /** Dotted entry id inside the loader's tree (see `EntryTree.sep`). */
  readonly id: string
  /** Module specifier the entry imports. */
  readonly name: string
  /** Effective disabled state, including inherited group disables. */
  readonly disabled: boolean
  /** True for a nested group entry rather than a leaf plugin. */
  readonly group: boolean
  /** Fiber lifecycle state, or `undefined` while the entry has no fiber (not yet started, or disabled). */
  readonly state: 'pending' | 'loading' | 'active' | 'failed' | 'disposed' | 'unloading' | undefined
}
