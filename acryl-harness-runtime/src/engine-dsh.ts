/**
 * The `dsh` engine provider (spec 028): mounts the pinned Harness `acryl`
 * profile as one Loader row under `createAcrylEngineHost`'s persistent root,
 * instead of the second Cordis root `bootAcrylHarnessProfile` creates via
 * `boot()`. Performs the identical composition - profile/patch resolution,
 * the HMR guard, workspace-status/session-log-exporter wiring - so selecting
 * `dsh` behaves exactly like today's direct boot (SC-004).
 *
 * `mountRootInclude` (unlike `boot()`) composes onto an already-initialized
 * Loader rather than creating its own, but it does not scope the Include row
 * it creates to the calling plugin's own fiber - this plugin owns and
 * removes it explicitly via `ctx.effect()`. Verified with a real Loader
 * activation in `tests/engine-host-mount-root-include.spec.ts` before this
 * file trusted the pattern.
 */

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  DEFAULT_PROFILE_BUNDLES,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  mountRootInclude,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

import { resolveAcrylDshHome } from './acryl-home.ts'
import { createAcrylCodingCapabilityPatches } from './coding-capabilities.ts'
import type { AcrylEngineDefinition } from './engine-host.ts'
import { installAcrylWorkspaceStatusTool } from './plugin-acryl-workspace-status.ts'
import { installSessionLogExporter } from './session-log-exporter.ts'

const require = createRequire(import.meta.url)
const dshInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')
const profileRoot = '[]\n'

/** Mount the pinned Harness `acryl` profile under the given already-initialized Loader `ctx`. */
async function applyDshEngine(ctx: Context, profileName: string): Promise<void> {
  process.env.DSH_HOME = resolveAcrylDshHome()
  const profileDirectory = resolveProfileDir(profileName)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await healProfilesModuleFallback({ installAnchor: dshInstallAnchor })
  const profile = loadProfile('acryl', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...createAcrylCodingCapabilityPatches(new Set(['tui'])),
    ...profile.patches,
  ])
  const hmr = composeEntries([patches]).find(entry => entry.id === 'hmr')
  if (hmr?.disabled !== true && !process.execArgv.includes('--expose-internals')) {
    throw new Error(
      'ACRYL profile enables Cordis HMR and must be launched with Node --expose-internals',
    )
  }
  ctx.baseUrl = pathToFileURL(dirname(rootConfig)).href + '/'
  // mountRootInclude's Include entry lands as a sibling of this plugin's own
  // entry in the shared host Loader tree, not a descendant of it (the same
  // fact behind the disposal fix above) - ctx.provide() on this plugin's own
  // forked ctx would not be an ancestor of that sibling's consumers.
  // ctx.root is the one scope every entry in the tree shares. dshHomePath is
  // a static, engine-agnostic value (home-path resolution helpers, not
  // per-engine state), so it is provided once and left on the host's root
  // rather than disposed per engine swap - re-providing it on a later
  // re-mount of `dsh` would otherwise throw "service already registered".
  if (ctx.root.get('dshHomePath') === undefined) ctx.root.provide('dshHomePath', dshHomePath)
  const entry = await mountRootInclude(ctx, rootConfig, patches)
  // mountRootInclude creates its Include row at the Loader's own top level -
  // it has no `parent` parameter and is not scoped to this plugin's own
  // fiber the way ctx.effect() resources are. Without this, an engine swap
  // away from `dsh` would leave the whole profile tree mounted forever.
  if (entry !== undefined) {
    ctx.effect(() => () => { void ctx.loader.remove(entry.options.id) })
  }
  // Do not call ctx.loader.await() here: this function is itself running as
  // part of one Loader entry's activation, and awaiting the same loader from
  // inside it deadlocks. createAcrylEngineHost's own ctx.loader.await(),
  // called from outside any entry after ctx.loader.create()/update()
  // resolves, already settles this nested tree too - proven in
  // tests/engine-host-mount-root-include.spec.ts.
  //
  // installAcrylWorkspaceStatusTool does bare ctx.tools property access,
  // which is topology-sensitive and requires a declared injection (not
  // satisfied by this plugin's own forked ctx, for the same sibling-not-
  // descendant reason as the dshHomePath fix above). ctx.inject(['tools'])
  // resolves that safely. Neither installAcrylWorkspaceStatusTool nor its
  // own `apply()` Cordis-plugin form wraps ctx.tools.register()'s returned
  // disposer in ctx.effect() (true of its other two callers too, harmless
  // there only because they own a whole process-lifetime root) - this
  // plugin must own that disposer itself, or an engine swap away from and
  // back to `dsh` would double-register the tool.
  // Guarded exactly like bootAcrylHarnessProfile's original check - some
  // profile variants legitimately have no ctx.tools at all (SC-004: this
  // extraction must not change that behavior).
  if (ctx.get('tools') !== undefined) {
    ctx.inject(['tools'], toolsCtx => {
      const disposeTool = installAcrylWorkspaceStatusTool(toolsCtx)
      ctx.effect(() => disposeTool)
    })
  }
  // ctx.logger is an ambient Cordis primitive, not a topology-sensitive
  // injected service (unlike ctx.tools), and ctx.logger.exporter() already
  // ties its own disposal to the ctx that registers it (see
  // installSessionLogExporter's own doc comment) - this plugin's own ctx is
  // correct here, unlike the two cases above.
  installSessionLogExporter(ctx, { surface: 'tui' })
}

/**
 * Build the `dsh` engine definition for `createAcrylEngineHost`, bound to
 * one profile name resolved at host-creation time (a CLI `--profile`
 * argument, not something an engine swap changes later).
 */
export function createDshEngineDefinition(profileName: string): AcrylEngineDefinition {
  if (profileName.trim() === '') throw new Error('ACRYL dsh engine profile must not be empty')
  return {
    id: 'dsh',
    plugin: (ctx: Context) => applyDshEngine(ctx, profileName),
  }
}
