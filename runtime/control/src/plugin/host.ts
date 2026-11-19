/**
 * Everything the plugin lifecycle controller needs from the host it runs in.
 *
 * The controller owns the lifecycle mechanics - resolution, dependent cascade,
 * transaction ordering, rollback, Fiber restart - and this port supplies the
 * three things that differ per surface: which entries are user-mutable, how
 * enablement is persisted, and what a just-installed bundle inserts.
 *
 * @module acryl-control/plugin/host
 */

import type { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'

/** The Loader identity of one entry, as a policy sees it. */
export interface PluginLifecycleEntryRef {
  /** Runtime Loader entry id, including its owning Include path when composed from one. */
  readonly entryId: string
  /** Exact module specifier the entry loads. */
  readonly moduleName: string
  /** Whether the entry is a Loader group rather than a plugin. */
  readonly group: boolean
}

/** The Loader row a profile-bundle package inserts, read from its own cordis patch. */
export interface PluginLifecycleBundleRow {
  readonly id: string
  readonly name: string
}

/** Shown for a non-mutable entry whose host supplies no wording of its own. */
export const PROTECTED_PLUGIN_ENTRY_REASON =
  'This entry is part of the runtime or is dependency-managed and is not user-toggleable. Plugins you add through a profile bundle or a plugin market can be enabled, disabled, and reloaded here.'

/**
 * Host policy and side effects behind the lifecycle controller.
 *
 * Implementations are host-neutral by contract: they may read a profile, a
 * state file, or a remote registry, but they never decide lifecycle order.
 */
export interface PluginLifecycleHost {
  /** Whether this host admits the entry to user lifecycle control. */
  isMutable(entry: PluginLifecycleEntryRef): boolean

  /**
   * Why an entry is not mutable, in the host's own words. Defaults to
   * {@link PROTECTED_PLUGIN_ENTRY_REASON}; a surface with its own explanation
   * (e.g. a Desktop runtime) overrides it.
   */
  protectedReason?(entry: PluginLifecycleEntryRef): string | null

  /**
   * Re-read any externally derived mutation state (a bundle list a package
   * manager just rewrote, for example). Called before every mutation, so a host
   * does not have to keep its own view fresh.
   */
  refresh?(): void

  /** Persist one entry's desired enablement. Rejects when the write fails. */
  setEnabled(entryId: string, enabled: boolean): Promise<void>

  /**
   * The Loader row a profile-bundle package inserts, for live activation of a
   * just-installed plugin. Consulted before the already-mounted shortcut, so it
   * is also the host's answer to "may this package be activated at all".
   *
   * Throws `PluginLifecycleError` with `protected-entry` when the package is
   * not an installed profile bundle, and with `lifecycle-failed` when it is a
   * bundle whose patch declares no usable insert row: only the host can tell a
   * package that was never installed from one that is installed but broken.
   * Optional - a host without a profile-bundle concept simply does not support
   * live activation.
   */
  bundleRow?(packageName: string): PluginLifecycleBundleRow

  /**
   * The Loader group a bundle row joins. Defaults to the Loader root; a
   * host that composes its profile through an include file returns that
   * include's group so a live install lands among the profile's own rows.
   */
  bundleGroup?(): EntryGroup

  /**
   * Host bookkeeping after a package leaves the Loader tree (pruning a stale
   * disable record, for example). Best effort: a rejection is reported through
   * {@link PluginLifecycleHost.warn} and never fails the uninstall.
   */
  afterDeactivate?(packageName: string): Promise<void>

  /**
   * Entries "reload all" sweeps, when the host's own reload is deliberately
   * narrower than every mutable entry. Optional - without it, reload-all
   * restarts every enabled mutable entry.
   */
  reloadAllEntryIds?(): ReadonlySet<string>

  /** Reports a best-effort failure (bookkeeping cleanup) that must not throw. */
  warn?(message: string): void
}
