/**
 * The `dsh` engine provider (spec 028): mounts the pinned Harness profile as
 * one Loader row under `createAcrylEngineHost`'s persistent root, instead of
 * the second Cordis root `boot()`/`bootAcrylHarnessProfile` creates. Performs
 * the identical composition - the HMR guard, workspace-status/session-log-
 * exporter wiring - so selecting `dsh` behaves exactly like today's direct
 * boot (SC-004).
 *
 * Two entry points share the mounting primitive (`mountDshEngine`) but differ
 * in where the composition comes from: {@link createDshEngineDefinition} is
 * the CLI/TUI flavor, resolving a named profile through this package's own
 * profile system; {@link createDshEngineDefinitionFromComposition} takes an
 * already-resolved `{rootConfig, patches, bareModuleBaseUrl}` a surface with
 * its own profile pipeline (Desktop's `prepareDesktopProfile()`) produced
 * itself. Neither does the other's job.
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
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
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

/** An already-resolved dsh composition: what one surface's own profile pipeline produced. */
export interface DshEngineComposition {
  readonly rootConfig: string
  readonly patches: readonly PatchOptions[]
  /** Resolves worker-only bare-module URLs (e.g. `/plugins/...`); omitted when the surface serves no such URLs. */
  readonly bareModuleBaseUrl?: string
  /** Which ACRYL surface this is (`tui`, `web`, `desktop`) - becomes part of the durable session-log filename. */
  readonly surface: string
}

/**
 * Mount an already-resolved dsh composition under the given already-
 * initialized Loader `ctx`. Does no profile resolution of its own - the
 * caller (a CLI `--profile` name resolved via `resolveProfileDir`/
 * `loadProfile`, or Desktop's own `prepareDesktopProfile()`) already
 * produced `rootConfig`/`patches`/`bareModuleBaseUrl`.
 */
async function mountDshEngine(ctx: Context, composition: DshEngineComposition): Promise<void> {
  const hmr = composeEntries([[...composition.patches]]).find(entry => entry.id === 'hmr')
  if (hmr?.disabled !== true && !process.execArgv.includes('--expose-internals')) {
    throw new Error(
      'ACRYL profile enables Cordis HMR and must be launched with Node --expose-internals',
    )
  }
  // This assignment feeds mountRootInclude's own nested composition tree
  // (constructed below, from this ctx) - not the host root's own top-level
  // tree, whose baseUrl is a one-time snapshot taken when `createAcrylEngineHost`
  // calls `ctx.plugin(Loader)`, long before this plugin function ever runs
  // (see engine-host.ts's `HOST_ROOT_BASE_URL`). Setting `ctx.baseUrl` here
  // reaches only entries nested inside mountRootInclude's own subtree (the
  // real DSH profile plugins) - the "acryl-engine-<id>" and sibling
  // "cordis:include" rows at the host's own top level are unaffected by
  // anything this function does.
  ctx.baseUrl = pathToFileURL(dirname(composition.rootConfig)).href + '/'
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
  const entry = await mountRootInclude(ctx, composition.rootConfig, composition.patches, composition.bareModuleBaseUrl)
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
  installSessionLogExporter(ctx, { surface: composition.surface })
}

/** Resolve the pinned Harness `acryl` profile by name into a mountable composition (the CLI/TUI flavor). */
async function resolveDshEngineComposition(profileName: string): Promise<DshEngineComposition> {
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
  return { rootConfig, patches, surface: 'tui' }
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
    plugin: async (ctx: Context) => mountDshEngine(ctx, await resolveDshEngineComposition(profileName)),
  }
}

/** Resolve the pinned Harness `web` profile into a mountable composition (the Web flavor). */
async function resolveWebEngineComposition(): Promise<DshEngineComposition> {
  const profileName = 'web'
  process.env.DSH_HOME = resolveAcrylDshHome()
  const profileDirectory = resolveProfileDir(profileName)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await healProfilesModuleFallback({ installAnchor: dshInstallAnchor })
  const profile = loadProfile('web', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...createAcrylCodingCapabilityPatches(new Set(['web'])),
    ...profile.patches,
  ])
  return { rootConfig, patches, surface: 'web' }
}

/**
 * Build the `dsh` engine definition for the Web surface's `web` profile
 * (`dsh-base` + `dsh-web-app`) - the same shared `mountDshEngine` primitive
 * as {@link createDshEngineDefinition}, resolved through this package's own
 * profile system like the CLI flavor (Web has no external profile pipeline
 * of its own, unlike Desktop's `prepareDesktopProfile()`).
 */
export function createWebEngineDefinition(): AcrylEngineDefinition {
  return {
    id: 'dsh',
    plugin: async (ctx: Context) => mountDshEngine(ctx, await resolveWebEngineComposition()),
  }
}

/**
 * Build the `dsh` engine definition from a composition a surface already
 * resolved itself (Desktop's `prepareDesktopProfile()`: its own profile
 * selection, market/editor/BLEND patch layering, and worker bare-module base
 * URL). Performs no profile resolution of its own - unlike
 * {@link createDshEngineDefinition}, which is the CLI/TUI flavor that
 * resolves a profile by name through `acryl-harness-runtime`'s own profile
 * system. Handing an already-resolved composition to that function would
 * silently discard it and resolve a different profile instead.
 */
export function createDshEngineDefinitionFromComposition(
  composition: DshEngineComposition,
): AcrylEngineDefinition {
  if (composition.surface.trim() === '') throw new Error('ACRYL dsh engine surface must not be empty')
  return {
    id: 'dsh',
    plugin: (ctx: Context) => mountDshEngine(ctx, composition),
  }
}
