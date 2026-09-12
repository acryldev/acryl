/**
 * The DSH-profile plugin lifecycle: one host policy, mounted as one Cordis
 * service, for every ACRYL surface (spec 034, T005).
 *
 * The lifecycle mechanics live in `acryl-control`'s host-neutral controller.
 * What is left here is the part that is the same on the Desktop, the Web host,
 * and the CLI: which rows a DSH profile admits to user control, where the
 * override file lives, and how a just-installed profile bundle inserts its row.
 * A surface that needs more (Desktop's Blend rows and market bookkeeping)
 * passes it in through the options rather than forking the policy.
 *
 * @module acryl-harness-runtime/plugin-lifecycle
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import {
  AcrPluginLifecycleController,
  AcrPluginLifecycleService,
  PROTECTED_PLUGIN_ENTRY_REASON,
  PluginLifecycleError,
  type PluginLifecycleEntryRef,
  type PluginLifecycleHost,
} from 'acryl-control'
import {
  readUserMutableBundleNames,
  setPluginLifecycleEntryEnabled,
  type PluginLifecycleStatePersistence,
  type ProfileNameValidator,
} from './plugin-lifecycle-state.ts'

/** Options every surface's DSH-profile lifecycle host is built from. */
export interface DshPluginLifecycleOptions {
  /** Profile whose override list this host reads and writes. */
  readonly profileName: string
  /** Profile directory - the source of the user-installed bundle list. */
  readonly profileDir: string
  /** Absolute path of the shared `plugin-lifecycle/state.json`. */
  readonly statePath: string
  /**
   * Loader row ids this surface itself admits to user control, in their runtime
   * spelling (`include:<row>` when the row is composed through an include).
   * Called on every policy read, so a surface may derive it lazily; the rows of
   * the profile's own `dsh.profile.bundles` are admitted on top of it.
   */
  readonly mutableEntryIds?: () => ReadonlySet<string>
  /** Name this host's bundle-patch diagnostics attribute a failure to. */
  readonly binName?: string
  /** Explanation shown for a non-mutable entry. */
  readonly protectedReason?: string
  /** Bookkeeping after a package leaves the Loader tree. Best effort. */
  readonly afterDeactivate?: (packageName: string) => Promise<void>
  /** Narrower reload-all sweep, when restarting every mutable entry is too much. */
  readonly reloadAllEntryIds?: () => ReadonlySet<string>
  /**
   * Resolves an installed package's manifest path from the profile's own
   * module base (a profile's `node_modules`, where a user-installed bundle
   * lives). Defaults to the context's base URL, which is the profile directory
   * for a surface that boots the profile itself and is not for one whose root
   * is elsewhere - the CLI composes the profile under its own engine host, so
   * it passes the profile-resolving form explicitly.
   */
  readonly resolvePackageJson?: (packageName: string) => string
  /** Reports a best-effort failure that must not throw to its caller. */
  readonly warn?: (message: string) => void
  /** Profile-name rule, when this surface names profiles its own way. */
  readonly validateProfileName?: ProfileNameValidator
}

interface BundleManifest {
  readonly name?: unknown
  readonly dsh?: { readonly bundle?: { readonly patch?: unknown } }
}

/**
 * Build the host policy for one DSH profile.
 *
 * @param ctx - the context whose Loader tree is being steered and whose
 * base URL resolves installed packages.
 * @param options - which profile, and whatever this surface adds to the
 * shared bundle policy.
 */
export function createDshPluginLifecycleHost(
  ctx: Context,
  options: DshPluginLifecycleOptions,
): PluginLifecycleHost {
  const binName = options.binName ?? 'acryl'
  const resolveManifest = options.resolvePackageJson
    ?? (ctx.baseUrl === undefined ? undefined : createRequire(ctx.baseUrl).resolve)
  const resolvePackageJson = resolveManifest === undefined
    ? undefined
    : (packageName: string) => resolveManifest(`${packageName}/package.json`)
  const persistence: PluginLifecycleStatePersistence = {
    profileName: options.profileName,
    statePath: options.statePath,
    ...(options.validateProfileName === undefined
      ? {}
      : { validateProfileName: options.validateProfileName }),
  }
  // Re-read on every mutation, never cached across one: a package manager
  // writes `dsh.profile.bundles` milliseconds before it asks for a live mount.
  let userBundleNames = readUserMutableBundleNames(options.profileDir)

  const protectedReason = options.protectedReason ?? PROTECTED_PLUGIN_ENTRY_REASON
  const warn = options.warn ?? ((message: string) => { ctx.logger?.warn?.(message) })

  const isBundlePackage = (packageName: string): boolean => userBundleNames.has(packageName)

  /** The `{ id, name }` a profile bundle inserts, read from its own patch. */
  function bundleInsertRow(packageName: string): { readonly id: string; readonly name: string } {
    if (resolvePackageJson === undefined) {
      throw new PluginLifecycleError(
        'lifecycle-failed',
        'Package resolution is unavailable in this context.',
      )
    }
    const packageDir = dirname(resolvePackageJson(packageName))
    const manifest = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8'),
    ) as BundleManifest
    const patchRel = manifest.dsh?.bundle?.patch
    if (typeof patchRel !== 'string') {
      throw new PluginLifecycleError(
        'lifecycle-failed',
        `Package ${packageName} declares no dsh.bundle.patch.`,
      )
    }
    const patches = loadOverlayPatches(binName, join(packageDir, patchRel)) as ReadonlyArray<{
      readonly insert?: ReadonlyArray<{ readonly id?: unknown; readonly name?: unknown }>
    }>
    const row = patches.find(patch => Array.isArray(patch.insert))?.insert?.[0]
    if (typeof row?.id !== 'string' || typeof row.name !== 'string') {
      throw new PluginLifecycleError(
        'lifecycle-failed',
        `Package ${packageName} bundle patch has no insert row.`,
      )
    }
    return { id: row.id, name: row.name }
  }

  return {
    isMutable(entry: PluginLifecycleEntryRef): boolean {
      if (entry.group) return false
      if (options.mutableEntryIds?.().has(entry.entryId) === true) return true
      return isBundlePackage(entry.moduleName)
    },
    protectedReason: () => protectedReason,
    refresh(): void {
      userBundleNames = readUserMutableBundleNames(options.profileDir)
    },
    setEnabled(entryId: string, enabled: boolean): Promise<void> {
      return setPluginLifecycleEntryEnabled(persistence, entryId, enabled)
    },
    bundleRow(packageName: string) {
      if (!isBundlePackage(packageName)) {
        throw new PluginLifecycleError(
          'protected-entry',
          `Package ${packageName} is not a profile bundle in the active profile.`,
        )
      }
      return bundleInsertRow(packageName)
    },
    bundleGroup(): EntryGroup {
      const sibling = [...ctx.loader.entries()]
        .find(entry => !entry.options.group && entry.id.startsWith('include:'))
      if (sibling === undefined) {
        throw new PluginLifecycleError(
          'lifecycle-failed',
          'The profile include group is not available.',
        )
      }
      return sibling.parent
    },
    warn,
    ...(options.afterDeactivate === undefined ? {} : { afterDeactivate: options.afterDeactivate }),
    ...(options.reloadAllEntryIds === undefined ? {} : { reloadAllEntryIds: options.reloadAllEntryIds }),
  }
}

/**
 * Build the lifecycle authority for one context: the one controller every
 * surface drives. Publishes nothing, so a surface that composes its own
 * capabilities (Desktop) can build it before deciding what to register.
 *
 * @param ctx - the context whose Loader tree it steers.
 * @param options - that surface's DSH-profile lifecycle host options.
 */
export function createAcrylPluginLifecycle(
  ctx: Context,
  options: DshPluginLifecycleOptions,
): AcrPluginLifecycleController {
  return new AcrPluginLifecycleController(ctx, createDshPluginLifecycleHost(ctx, options))
}

/**
 * Publish that authority on `ctx.acrPluginLifecycle` for the caller's fiber
 * lifetime. Every surface renders its own view of the snapshot; none of them
 * re-implements enable, disable, or reload.
 *
 * @param ctx - the plugin context the service belongs to.
 * @param options - that surface's DSH-profile lifecycle host options.
 */
export function mountAcrylPluginLifecycle(
  ctx: Context,
  options: DshPluginLifecycleOptions,
): AcrPluginLifecycleService {
  return new AcrPluginLifecycleService(ctx, createAcrylPluginLifecycle(ctx, options))
}
