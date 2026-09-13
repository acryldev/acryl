/**
 * `acryl plugin …`: this terminal surface's view onto the one shared plugin
 * lifecycle (spec 034, FR-004).
 *
 * The commands own no lifecycle logic. They boot the profile exactly as the
 * TUI does, mount the same `ctx.acrPluginLifecycle` capability every other
 * surface mounts, drive it, and dispose - so `acryl plugin disable` and the
 * Desktop panel's toggle write the same override file and the next boot of
 * either surface composes the same plugin set.
 *
 * @module acryl-cli/host/plugin-command
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import {
  diagnosePluginLifecycle,
  entryPatchId,
  mountAcrylPluginLifecycle,
  resolveAcrylDshHome,
  resolvePluginLifecycleStatePath,
  type PluginHealthReport,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from 'acryl-harness-runtime'
import { startDirectHost } from './direct.ts'

/** Actions this module implements; `add`/`remove` are install (spec 034, T006). */
export type AcrylPluginCommandAction = 'list' | 'enable' | 'disable' | 'doctor'

export interface PluginCommandOptions {
  readonly profile: string
  readonly action: AcrylPluginCommandAction
  /** Required for `enable`/`disable`; resolved against the live entry list. */
  readonly entryId?: string
}

export interface PluginCommandContext {
  readonly profile: string
  readonly engine: string
  readonly statePath: string
}

export type PluginCommandResult =
  | (PluginCommandContext & { readonly kind: 'snapshot'; readonly snapshot: PluginLifecycleSnapshot })
  | (PluginCommandContext & { readonly kind: 'receipt'; readonly receipt: PluginLifecycleReceipt })
  | (PluginCommandContext & { readonly kind: 'health'; readonly report: PluginHealthReport })

/**
 * The entry a user's argument names. A user types what they see - a row id
 * (`ui-acryl`), a runtime entry id (`include:ui-acryl`), or the package name
 * the market shows - and all three have to reach the same Loader entry.
 */
export function resolvePluginEntryId(
  profile: string,
  snapshot: PluginLifecycleSnapshot,
  argument: string,
): string {
  const entries = snapshot.entries
  const byId = entries.filter(entry =>
    entry.entryId === argument || entryPatchId(entry.entryId) === argument)
  const matches = byId.length > 0
    ? byId
    : entries.filter(entry => entry.moduleName === argument)
  if (matches.length === 0) {
    throw new Error(
      `profile ${JSON.stringify(profile)} has no plugin ${JSON.stringify(argument)}; run \`acryl plugin list --profile ${profile}\``,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `${JSON.stringify(argument)} is ambiguous in profile ${JSON.stringify(profile)}: ${matches.map(entry => entry.entryId).join(', ')}`,
    )
  }
  return matches[0]!.entryId
}

/**
 * Boot the profile, drive the shared lifecycle, dispose. The host is
 * disposable either way: a failed command must not leave a Cordis tree (and
 * its child processes) behind.
 */
export async function runPluginCommand(options: PluginCommandOptions): Promise<PluginCommandResult> {
  const host = await startDirectHost({ profile: options.profile })
  try {
    // The composition resolved the profile while booting, so DSH_HOME - and
    // therefore the profile directory and its package resolution - are the
    // ones this process actually composed.
    const profileDir = resolveProfileDir(options.profile)
    // The same engine home this boot composed, which is also what the Desktop
    // panel resolves for the same profile (spec 034, FR-003).
    const statePath = resolvePluginLifecycleStatePath(resolveAcrylDshHome())
    // Installed bundles resolve from the profile's own node_modules, which is
    // also the base the composed rows themselves resolve through - not from
    // this surface's installation directory.
    const profileRequire = createRequire(join(profileDir, 'package.json'))
    const lifecycle = mountAcrylPluginLifecycle(host.ctx, {
      profileName: options.profile,
      profileDir,
      statePath,
      binName: 'acryl',
      // createDshPluginLifecycleHost's own internal wrapper already appends
      // "/package.json" before calling this callback - despite the option's
      // own parameter being named `packageName`, what actually arrives here
      // is the full "<packageName>/package.json" specifier already (unlike
      // diagnosePluginLifecycle's own resolvePackageJson below, which does
      // not pre-append and genuinely wants the bare name). Never exercised
      // on the CLI until acryl-web's own live-activation path hit
      // ERR_PACKAGE_PATH_NOT_EXPORTED on a literal "package.json/package.json"
      // subpath and traced back to this identical bug (spec 034 T006).
      resolvePackageJson: specifier => profileRequire.resolve(specifier),
    })
    const context: PluginCommandContext = {
      profile: options.profile,
      engine: host.engine,
      statePath,
    }

    if (options.action === 'doctor') {
      return {
        ...context,
        kind: 'health',
        report: diagnosePluginLifecycle({
          profileName: options.profile,
          profileDir,
          statePath,
          snapshot: lifecycle.snapshot(),
          resolvePackageJson: packageName => profileRequire.resolve(`${packageName}/package.json`),
        }),
      }
    }

    if (options.action === 'list') {
      return { ...context, kind: 'snapshot', snapshot: lifecycle.snapshot() }
    }

    const requested = options.entryId
    if (requested === undefined) {
      throw new Error(`plugin ${options.action} requires a plugin id`)
    }
    const entryId = resolvePluginEntryId(options.profile, lifecycle.snapshot(), requested)
    return {
      ...context,
      kind: 'receipt',
      receipt: await lifecycle.setEnabled(entryId, options.action === 'enable'),
    }
  } finally {
    await host.dispose()
  }
}
