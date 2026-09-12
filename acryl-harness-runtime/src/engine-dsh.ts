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

import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  DEFAULT_PROFILE_BUNDLES,
  PROFILE_TEMPLATES,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  mountRootInclude,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'

import { resolveAcrylDshHome } from './acryl-home.ts'
import { createAcrylCodingCapabilityPatches } from './coding-capabilities.ts'
import type { AcrylEngineDefinition } from './engine-host.ts'
import { installAcrylWorkspaceStatusTool } from './plugin-acryl-workspace-status.ts'
import { pluginLifecyclePatches, resolvePluginLifecycleStatePath } from './plugin-lifecycle-state.ts'
import { installSessionLogExporter } from './session-log-exporter.ts'
import { provideWebMarketInstall } from './web-market-install.ts'
import { provideWebMarketPlugins } from './web-market-plugins.ts'

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
  // Web only: the shell HTML dsh-web-app serves is a pinned
  // @deepseek-ai/dsh-web-frontend build artifact with a hardcoded
  // "DeepSeek Harness" <title> - not part of the pluggable Cordis Client
  // slot system the brand-swap patch (resolveWebEngineComposition) actually
  // covers, so swapping ui-brand-official for ui-acryl alone leaves the
  // visible browser-tab title wrong. Reproduced directly: a real served
  // index still read "<title>DeepSeek Harness</title>" after the brand-swap
  // patch landed. Desktop does not have this gap - electron-shell-
  // generation.ts already suppresses page-title-updated and keeps its
  // native window title fixed at the OS level, so this vendored HTML's
  // <title> never reaches anything the user sees there; Web has no native
  // window, so this served HTML's own <title> IS the visible artifact.
  // dsh-host-webserver's WebServer service exposes tapIndex(transform) as
  // its own designed escape hatch for exactly this class of rewrite ("no
  // IndexInjection row exists for this", per its own doc comment) -
  // registering a tap here, rather than editing the vendored
  // dsh-web-frontend package, which the project's own repo rules forbid.
  // Only the title is fixed here; a matching ACRYL favicon needs a real
  // static asset plus a route to serve it, tracked separately.
  if (composition.surface === 'web') {
    ctx.inject(['webServer'], webServerCtx => {
      const disposeTap = webServerCtx.webServer.tapIndex(
        html => html.replace(/<title>[^<]*<\/title>/i, '<title>ACRYL</title>'),
      )
      ctx.effect(() => disposeTap)
    })
    // Web's own desktopPlugins/livePluginActivation (spec 034 T006) - mounted
    // BEFORE desktopProfiles/desktopPnpm below on purpose. dsh-community-
    // market's own ctx.inject(['desktopProfiles', 'desktopPnpm'], ...) reads
    // ctx.get('livePluginActivation') exactly once, opportunistically, the
    // moment that inject's dependencies first resolve - not reactively, so a
    // livePluginActivation provided AFTER that moment is captured as
    // `undefined` for the fiber's whole life. Reproduced directly: with the
    // reverse order, a real install through the Market succeeded but the
    // installed plugin never became active without a full process restart -
    // no error anywhere, just a silently-missed live-activation opportunity.
    // Web has no shared plugin-lifecycle mount at all before this - CLI's and
    // Desktop's own each mount it separately, so this is the first time Web
    // gets one. Guarded like dshHomePath above: an engine swap away from and
    // back to `dsh` must not re-provide an already-registered service.
    if (ctx.root.get('desktopPlugins') === undefined) {
      const profileDir = dirname(composition.rootConfig)
      provideWebMarketPlugins(ctx.root, {
        profileName: 'web',
        profileDir,
        statePath: resolvePluginLifecycleStatePath(),
        binName: 'acryl-web',
        // `createDshPluginLifecycleHost`'s own internal wrapper already
        // appends "/package.json" before calling this callback - despite the
        // option's own parameter being named `packageName`, what actually
        // arrives here is the full "<packageName>/package.json" specifier
        // already. Reproduced directly: a real live-activation attempt threw
        // ERR_PACKAGE_PATH_NOT_EXPORTED on a literal "package.json/package.json"
        // subpath before this fix - the same latent bug exists in acryl-cli's
        // own plugin-command.ts, just never exercised there (the CLI has no
        // install/live-activation path yet, spec 034 T006).
        resolvePackageJson: specifier => createRequire(pathToFileURL(join(profileDir, 'package.json'))).resolve(specifier),
      })
    }
    // Web's own desktopProfiles/desktopPnpm (spec 034 T006, scoped v1) - what
    // dsh-community-market's install service needs for its Install/Uninstall
    // buttons to do a real operation instead of showing "ACRYL is required".
    // Both are stateless besides this one profile's own fixed name/directory,
    // so - also like dshHomePath - never disposed; there is nothing to
    // invalidate by leaving them registered for the process's whole life.
    if (ctx.root.get('desktopProfiles') === undefined) {
      provideWebMarketInstall(ctx.root, dirname(composition.rootConfig))
    }
  }
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
  // The profile's own user overrides come from the shared store, not from this
  // surface: `acryl plugin disable` on a TUI writes the same file the Desktop
  // panel and the Web surface read, so the next boot of any of them composes
  // the same plugin set.
  patches.push(...pluginLifecyclePatches({
    profileName,
    statePath: resolvePluginLifecycleStatePath(),
  }))
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

/**
 * Symlink one ACRYL-owned package into a profile's own `node_modules`, so
 * Node's ordinary bare-specifier resolution - the only mechanism
 * `HostResolvedRootInclude`'s composed rows use, verified directly by
 * logging every `resolve()` call: `context.parentURL` is always the
 * profile's own `package.json`, never `@deepseek-ai/cordis-plugin-loader`'s
 * own entry - can find it. A resolution-hook overlay (matching
 * `acryl-desktop`'s `installProfilePackageResolver`) cannot help here: it
 * only intercepts imports whose parent is the Loader's own entry module,
 * which this composition style never uses. Idempotent: replaces a stale
 * symlink pointing elsewhere, leaves an already-correct one untouched.
 */
function materializeProfilePackage(profileDir: string, packageName: string, installPackageUrl: string): void {
  const manifestPath = findPackageJSON(packageName, installPackageUrl)
  if (manifestPath === undefined) {
    throw new Error(`ACRYL web profile: cannot resolve package ${JSON.stringify(packageName)} from the acryl-web installation`)
  }
  const sourceDir = dirname(manifestPath)
  const linkPath = join(profileDir, 'node_modules', packageName)
  mkdirSync(dirname(linkPath), { recursive: true })
  if (existsSync(linkPath)) {
    if (realpathSync.native(linkPath) === realpathSync.native(sourceDir)) return
    rmSync(linkPath, { force: true, recursive: true })
  }
  symlinkSync(sourceDir, linkPath, 'dir')
}

/** Resolve the pinned Harness `web` profile into a mountable composition (the Web flavor). */
async function resolveWebEngineComposition(installPackageUrl: string): Promise<DshEngineComposition> {
  const profileName = 'web'
  process.env.DSH_HOME = resolveAcrylDshHome()
  const profileDirectory = resolveProfileDir(profileName)
  // The shipped `web` template (PROFILE_TEMPLATES.web) bundles dsh-web-app
  // (dsh-client-connection, webStartup, the auth-gated index) on top of
  // dsh-base - DEFAULT_PROFILE_BUNDLES is only ['@deepseek-ai/dsh-base'], the
  // generic fallback loadProfile() uses for a *custom-named* profile with no
  // shipped template (the CLI/TUI flavor's own 'acryl'/'--profile' names).
  // initProfile() only writes package.json when one doesn't exist yet, so
  // calling it here with the wrong (too-minimal) bundle list on a profile
  // loadProfile() would otherwise auto-initialize correctly *pre-empts* that
  // correct initialization - a fresh 'web' profile then permanently has no
  // dsh-web-app bundle, so ctx.get('connection')/ctx.get('webStartup') never
  // exist and the served index falls back to its own "authentication
  // required" client-side message rather than ever serving the app.
  // Reproduced directly: a fresh profile's Loader entries contained no
  // "connection" or "web-startup" row at all (not pending, not failed -
  // absent) before this fix.
  const webTemplate = PROFILE_TEMPLATES.web
  initProfile(profileDirectory, webTemplate?.bundles ?? DEFAULT_PROFILE_BUNDLES, webTemplate?.patchReload)
  await healProfilesModuleFallback({ installAnchor: dshInstallAnchor })
  const profile = loadProfile('web', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...createAcrylCodingCapabilityPatches(new Set(['web'])),
    ...profile.patches,
  ])
  // Brand swap: same technique and same row id as acryl-desktop's own
  // (independent) brand swap in profile.ts - the stock DeepSeek Harness
  // identity (`@deepseek-ai/dsh-client-ui-brand-official`, already composed
  // by the base dsh-web-app bundle at row id `ui-brand-official`) and
  // `dsh-client-ui-brand-acryl` are standalone, independently swappable
  // Cordis Client plugins carrying the same slot contract
  // (`sidebar.brand.mark`/`.name`, `conversation.hero.brand.mark`) - exactly
  // one is ever enabled. Validated against the real composed row (not
  // assumed) so a future dsh-web-app bundle change that renames or removes
  // this row fails loud here instead of silently keeping the DeepSeek brand.
  const officialBrandRow = composeEntries([patches]).find(entry => entry.id === 'ui-brand-official')
  if (officialBrandRow?.name !== '@deepseek-ai/dsh-client-ui-brand-official') {
    throw new Error('ACRYL web profile must use @deepseek-ai/dsh-client-ui-brand-official in the ui-brand-official row')
  }
  // dsh-client-ui-brand-acryl is an ACRYL-owned workspace package, not a
  // dependency of @deepseek-ai/dsh itself, so healProfilesModuleFallback's
  // installAnchor-rooted closure (above) can never resolve it - reproduced
  // directly: a real Loader activation failed with "Cannot find package
  // 'dsh-client-ui-brand-acryl'" even after declaring it everywhere, because
  // that fallback mechanism is fundamentally rooted at @deepseek-ai/dsh's own
  // dependency tree, never the calling surface's own. Materializing it
  // directly into this profile's own node_modules (matching this profile
  // directory's own resolution base, verified by logging every resolve()
  // call HostResolvedRootInclude's composed rows make) is what actually
  // makes it resolvable - a resolution-hook overlay (acryl-desktop's
  // installProfilePackageResolver) does not apply to this composition style
  // at all, confirmed the same way.
  materializeProfilePackage(profile.dir, 'dsh-client-ui-brand-acryl', installPackageUrl)
  patches.push(
    { id: 'ui-brand-official', disabled: true },
    { insert: [{ id: 'ui-acryl', name: 'dsh-client-ui-brand-acryl', disabled: false }] },
  )
  // Community Market: same row id/name acryl-desktop's own profile.ts uses
  // (DESKTOP_MARKET_IDENTITIES.community), same materialization technique as
  // the brand swap above - dsh-community-market is another ACRYL-owned
  // workspace package outside @deepseek-ai/dsh's own dependency closure.
  // Unlike Desktop, Web has no on/off provider switch (Desktop's Market is
  // disabled by default and user-toggleable via desktop-market.ts) - Web has
  // no such setting surface yet, so this row is simply always present.
  // dsh-community-market's own top-level inject (['webServer', 'settings'])
  // needs nothing Desktop-specific - its host code's own comment documents
  // this deliberately ("Browsing remains portable"): Discover/Installable/
  // Sources activate on any surface with webServer+settings, while real
  // install/uninstall is a second, nested `ctx.inject(['desktopProfiles',
  // 'desktopPnpm'], ...)` that simply stays PENDING (no error, no crash) on
  // Web today. Web-side desktopProfiles/desktopPnpm equivalents - and so
  // Market install/uninstall parity with Desktop - remain a separate,
  // unstarted piece of work; this row only turns on browsing.
  materializeProfilePackage(profile.dir, 'dsh-community-market', installPackageUrl)
  patches.push({ insert: [{ id: 'community-market', name: 'dsh-community-market' }] })
  // Last, so a user override beats every composition decision above it - the
  // same shared store the CLI and the Desktop panel write (spec 034).
  patches.push(...pluginLifecyclePatches({
    profileName,
    statePath: resolvePluginLifecycleStatePath(),
  }))
  return { rootConfig, patches, surface: 'web' }
}

/**
 * Build the `dsh` engine definition for the Web surface's `web` profile
 * (`dsh-base` + `dsh-web-app`) - the same shared `mountDshEngine` primitive
 * as {@link createDshEngineDefinition}, resolved through this package's own
 * profile system like the CLI flavor (Web has no external profile pipeline
 * of its own, unlike Desktop's `prepareDesktopProfile()`).
 * @param installPackageUrl - file URL of `acryl-web`'s own `package.json`,
 * used to materialize `dsh-client-ui-brand-acryl` and `dsh-community-market`
 * into the profile (see {@link resolveWebEngineComposition}'s own comments
 * for why that is needed).
 */
export function createWebEngineDefinition(installPackageUrl: string): AcrylEngineDefinition {
  return {
    id: 'dsh',
    plugin: async (ctx: Context) => mountDshEngine(ctx, await resolveWebEngineComposition(installPackageUrl)),
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
