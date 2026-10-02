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

import { applyWebFavicon } from './web-favicon.ts'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { evaluate, isJsExpr } from '@deepseek-ai/cordis-plugin-loader'
import {
  DEFAULT_PROFILE_BUNDLES,
  PROFILE_TEMPLATES,
  PluginPackages,
  composeEntries,
  createRuntimeResolution,
  initProfile,
  loadProfile,
  removeLinkProjections,
  mountRootInclude,
  resolveProfileDir,
  type Profile,
  type RuntimeResolution,
} from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'

import { provideCliMarketInstall } from './cli-market-install.ts'
import { provideCliMarketPlugins } from './cli-market-plugins.ts'
import {
  acrylCodingCapabilityPackages,
  createAcrylCodingCapabilityPatches,
  createAcrylShellCapabilityPatches,
} from './coding-capabilities.ts'
import type { AcrylEngineDefinition } from './engine-host.ts'
import { installAcrylWorkspaceStatusTool } from './plugin-acryl-workspace-status.ts'
import { blueprintFromEnvironment, composeBlueprintRows } from './blueprint/index.ts'
import { findFreeWebPort, webPortPatch } from './web-port.ts'
import { selectInstance, type AppInstance } from './instance/index.ts'
import { claimProfile } from './profile-owner.ts'
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
  /** The product name the page title carries (the Blueprint's brand); defaults to `ACRYL`. */
  readonly productName?: string
  /** The app this composition belongs to; provided to plugins as the `appInstance` service. Chosen by the surface's composition root. */
  readonly instance?: AppInstance
  /** File URL of the surface's own `package.json` (where ACRYL-owned workspace packages resolve from); provided to plugins
   * as the `acrylFrameworkPackages` service. Omitted where materializing an ACRYL framework package into a local
   * extension's profile does not apply (for example, a composition root with its own separate profile pipeline). */
  readonly installPackageUrl?: string
  /**
   * The package table `@deepseek-ai/dsh-app-boot` computes for this profile (DSH 0.2). Since 0.2 a profile no longer carries link
   * projections of the installation's packages; the `PluginPackages` service answers every bare-package import from this table, so
   * the engine mounts it before the profile include. Compute it with {@link createProfileRuntimeResolution} after every
   * ACRYL-owned package has been materialized into the profile.
   */
  readonly runtimeResolution?: RuntimeResolution
}

/**
 * The runtime resolution for a loaded profile, as stock `dsh` computes it (`profile-boot`: `composeProfile`).
 * @param installAnchor - the `package.json` whose dependency closure the profile may import from. Defaults to the `dsh`
 * package; a surface that ships ACRYL-owned packages (Desktop) passes its own, so those resolve like any dependency.
 */
export function createProfileRuntimeResolution(profile: Profile, installAnchor: string = dshInstallAnchor): Promise<RuntimeResolution> {
  return createRuntimeResolution({ installAnchor, profile })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, character => `&#${String(character.charCodeAt(0))};`)
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
  // DSH 0.2 gates the row with `!!js "!ctx.get('profileContext')"`, not a literal `true`: evaluate it against this host's own context
  // (ACRYL never provides a `profileContext`, so HMR is off and no internals are required).
  const hmrDisabled = hmr === undefined || (isJsExpr(hmr.disabled) ? Boolean(evaluate({ ctx }, hmr.disabled.__jsExpr)) : hmr.disabled === true)
  if (!hmrDisabled && !process.execArgv.includes('--expose-internals')) {
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
  // The app's resource family (instance/): plugins read where their app keeps things from here, never from the environment or the OS home.
  if (ctx.root.get('appInstance' as never) === undefined) ctx.root.provide('appInstance', composition.instance ?? selectInstance())
  if (composition.installPackageUrl !== undefined && ctx.root.get('acrylFrameworkPackages' as never) === undefined) {
    ctx.root.provide('acrylFrameworkPackages', createAcrylFrameworkPackages(composition.installPackageUrl))
  }
  // Owned by this engine's fiber (not the root), so an engine swap releases the interception with the profile it served.
  if (composition.runtimeResolution !== undefined) await ctx.plugin(PluginPackages, { resolution: composition.runtimeResolution })
  const entry = await mountRootInclude(ctx, composition.rootConfig, composition.patches, composition.bareModuleBaseUrl)
  // mountRootInclude creates its Include row at the Loader's own top level -
  // it has no `parent` parameter and is not scoped to this plugin's own
  // fiber the way ctx.effect() resources are. Without this, an engine swap
  // away from `dsh` would leave the whole profile tree mounted forever.
  if (entry !== undefined) {
    // Loader 1.0.5's `remove` starts the row's disposal without waiting for it, so wait for the include's fiber here:
    // a swap away from `dsh` must not return while the profile's services are still registered.
    ctx.effect(() => async () => {
      const fiber = entry.fiber
      ctx.loader.remove(entry.options.id)
      await fiber?.dispose()
    })
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
  // The same tap swaps the favicon for the ACRYL logo, inlined as a data URL
  // (web-favicon.ts), so no route or static asset is needed.
  if (composition.surface === 'web') {
    ctx.inject(['webServer'], webServerCtx => {
      const title = composition.productName ?? 'ACRYL'
      const disposeTap = webServerCtx.webServer.tapIndex(
        // A custom brand ships its own favicon (acryl-brand); only the stock ACRYL brand gets the ACRYL logo.
        html => {
          const titled = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeHtml(title)}</title>`)
          return composition.productName === undefined ? applyWebFavicon(titled) : titled
        },
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
    // cordis-plugin-market's install service needs for its Install/Uninstall
    // buttons to do a real operation instead of showing "ACRYL is required".
    // Both are stateless besides this one profile's own fixed name/directory,
    // so - also like dshHomePath - never disposed; there is nothing to
    // invalidate by leaving them registered for the process's whole life.
    if (ctx.root.get('desktopProfiles') === undefined) {
      provideWebMarketInstall(ctx.root, dirname(composition.rootConfig))
    }
  }
  // CLI/TUI's own desktopPlugins/livePluginActivation + desktopProfiles/
  // desktopPnpm (spec 034 T006, completing the third surface) - same
  // ordering constraint as Web above (mount desktopPlugins first, since
  // cordis-plugin-market's own ctx.inject(['desktopProfiles', 'desktopPnpm'])
  // reads ctx.get('livePluginActivation') exactly once, opportunistically).
  // Unlike Web, the CLI has more than one named profile, so the profile name
  // comes from this composition's own directory rather than a literal - see
  // dsh-app-boot's own `$DSH_HOME/profiles/<name>` layout contract.
  if (composition.surface === 'tui') {
    const profileDir = dirname(composition.rootConfig)
    const profileName = basename(profileDir)
    if (ctx.root.get('desktopPlugins') === undefined) {
      provideCliMarketPlugins(ctx.root, {
        profileName,
        profileDir,
        statePath: resolvePluginLifecycleStatePath(),
        binName: 'acryl',
        // Same double-append trap as web-market-plugins.ts's own resolvePackageJson
        // and acryl-cli's own plugin-command.ts: createDshPluginLifecycleHost's
        // internal wrapper already appends "/package.json" before calling this.
        resolvePackageJson: specifier => createRequire(pathToFileURL(join(profileDir, 'package.json'))).resolve(specifier),
      })
    }
    if (ctx.root.get('desktopProfiles') === undefined) {
      provideCliMarketInstall(ctx.root, { name: profileName, dir: profileDir })
    }
  }
}

/** An app folder's own definition is its Blueprint unless one was chosen explicitly. */
function instanceBlueprintEnvironment(instance: AppInstance): NodeJS.ProcessEnv {
  const explicit = process.env.ACRYL_BLUEPRINT
  return explicit === undefined || explicit.trim() === '' ? { ...process.env, ...(instance.definitionFile === undefined ? {} : { ACRYL_BLUEPRINT: instance.definitionFile }) } : process.env
}

/** Resolve the pinned Harness `acryl` profile by name into a mountable composition (the CLI/TUI flavor). */
async function resolveDshEngineComposition(profileName: string): Promise<DshEngineComposition> {
  // The composition root for the CLI surface: the app instance is chosen here, once. The pinned harness reads its home from DSH_HOME, so the instance is
  // handed across that boundary through the environment.
  const instance = selectInstance()
  process.env.DSH_HOME = instance.dshHome
  // Read by `acryl_workspace_status`: the agent must learn the real surface and profile, not a fallback label.
  process.env.ACRYL_SURFACE = 'tui'
  process.env.ACRYL_PROFILE = profileName
  const profileDirectory = resolveProfileDir(profileName)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  removeLinkProjections(profileDirectory)
  const profile = loadProfile('acryl', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  // Refuse to re-link a profile another live ACRYL installation is running from (profile-owner.ts).
  claimProfile(profile.dir, installationRoot(import.meta.url))
  writeFileSync(rootConfig, profileRoot)
  const profileLayerPatches = profile.layers.flatMap(layer => layer.patches)
  // A profile directory booted through this CLI/TUI flavor is not necessarily
  // tui-shaped: `--profile <name>` can point at one created by Desktop/Web's
  // own richer template, whose bundle already composes agent-presets/persona/
  // session-stats natively. Without this, ACRYL's own tui-only insert of the
  // same row ids collides at boot (spec 034 T008).
  const existingRowIds = new Set(composeEntries([profileLayerPatches]).map(entry => entry.id))
  const blueprint = blueprintFromEnvironment(instanceBlueprintEnvironment(instance))
  process.env.ACRYL_BLUEPRINT_ID = blueprint.id
  const rowsComposition = composeBlueprintRows(blueprint, 'tui', existingRowIds)
  const patches = structuredClone([
    ...profileLayerPatches,
    ...createAcrylCodingCapabilityPatches(new Set(['tui']), existingRowIds, new Set(blueprint.capabilities)),
    ...profile.patches,
  ])
  // The Blueprint's ACRYL-owned rows (extension pack, prompt shaping) and the terminal UI library (a plain library a
  // terminal plugin imports, so it is only made resolvable). Rows the profile's own bundle already composes are skipped
  // by `composeBlueprintRows` (a Desktop/Web-shaped profile booted through the CLI).
  // The ACRYL packages the terminal's coding capabilities name (`acryl-settings`), resolvable from this profile like the Web surface's.
  const tuiCapabilityPackages = acrylCodingCapabilityPackages(new Set(['tui'] as const), new Set(blueprint.capabilities))
  for (const packageName of [...tuiCapabilityPackages, ...rowsComposition.packages]) materializeProfilePackage(profile.dir, packageName, import.meta.url)
  patches.push(...rowsComposition.patches)
  // The profile's own user overrides come from the shared store, not from this
  // surface: `acryl plugin disable` on a TUI writes the same file the Desktop
  // panel and the Web surface read, so the next boot of any of them composes
  // the same plugin set.
  patches.push(...pluginLifecyclePatches({
    profileName,
    statePath: resolvePluginLifecycleStatePath(),
  }))
  return { rootConfig, patches, surface: 'tui', instance, installPackageUrl: import.meta.url, runtimeResolution: await createProfileRuntimeResolution(profile) }
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
 * Add one declared dependency to a Loader row's `inject` metadata. A patch
 * replaces the whole value, so the row's own declaration is preserved in either
 * the list or the map form Cordis accepts.
 */
function withDeclaredDependency(inject: unknown, name: string): string[] | Record<string, unknown> {
  if (Array.isArray(inject)) return inject.includes(name) ? [...inject] : [...inject, name]
  if (inject !== null && typeof inject === 'object') {
    const declared = inject as Record<string, unknown>
    return name in declared ? { ...declared } : { ...declared, [name]: null }
  }
  return [name]
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
 *
 * The "stale" case is not hypothetical - it is the actual CI failure mode.
 * `release-cli.yml`'s `web` job runs the test suite and
 * `verify-npm-web-entrypoint.mjs` *before* building and smoke-testing the
 * release archive, in the same job, against the same shared
 * `~/.acryl/.dsh` home. Both earlier steps materialize this exact symlink
 * pointing at their own temporary staging directories, then delete those
 * directories in their own cleanup - leaving a **dangling** symlink behind
 * in the shared profile, not a missing one. The later archive-smoke step's
 * own `materializeProfilePackage` call then hits `EEXIST` (something is
 * there) and, before this fix, called `realpathSync.native` on it to
 * decide whether to replace it - which throws `ENOENT` on a dangling
 * symlink instead of returning a comparable path, crashing where the
 * function should simply have replaced the stale link. (An earlier pass
 * misdiagnosed this as an N-way in-process race and added a same-process
 * memo guard; that guard was harmless but irrelevant - every reproduction
 * that actually matched CI's real symptom involved *no* concurrency at
 * all, just one process inheriting another, earlier process's leftover
 * dangling link.)
 */
/** The installation a module belongs to: the directory of its nearest package.json (the runtime or surface package of that checkout or install). */
function installationRoot(moduleUrl: string): string {
  const manifest = findPackageJSON(moduleUrl)
  return manifest === undefined ? fileURLToPath(moduleUrl) : dirname(manifest)
}

export function materializeProfilePackage(profileDir: string, packageName: string, installPackageUrl: string): void {
  const manifestPath = findPackageJSON(packageName, installPackageUrl)
  if (manifestPath === undefined) {
    throw new Error(`ACRYL web profile: cannot resolve package ${JSON.stringify(packageName)} from the acryl-web installation`)
  }
  const sourceDir = dirname(manifestPath)
  const linkPath = join(profileDir, 'node_modules', packageName)
  mkdirSync(dirname(linkPath), { recursive: true })
  // `lstatSync` (not `existsSync`/`realpathSync`, both of which follow the
  // symlink and would throw or report "missing" for a dangling one) is the
  // only one of the three that answers "is there a filesystem entry at
  // this exact path at all" without caring whether it resolves.
  const hasEntry = (() => {
    try {
      lstatSync(linkPath)
      return true
    } catch {
      return false
    }
  })()
  if (hasEntry) {
    // realpathSync throws on a dangling symlink rather than returning a
    // comparable path - that case means "stale", exactly like a mismatch.
    let existingTarget: string | undefined
    try {
      existingTarget = realpathSync.native(linkPath)
    } catch {
      existingTarget = undefined
    }
    if (existingTarget === realpathSync.native(sourceDir)) return
    rmSync(linkPath, { force: true, recursive: true })
  }
  symlinkSync(sourceDir, linkPath, 'dir')
}

/**
 * Resolves an ACRYL-owned workspace package by name into its live on-disk install and symlinks it into a
 * profile, the same way the Blueprint's own fixed rows do ({@link materializeProfilePackage}) - these
 * packages are not published, so a local extension's `package.json` cannot name one as an ordinary npm
 * dependency. Consumed by `acryl-extension-context`'s local-plugin install path (`dsh.requiresAcrylPackages`
 * in an extension's `package.json`), which also activates the materialized package as a live Loader entry
 * through the existing `livePluginActivation` service - this object only makes the package resolvable.
 */
export interface AcrylFrameworkPackages {
  /** Symlink `name` into `profileDir`'s `node_modules`, replacing a stale link; throws if `name` does not resolve from this installation. */
  materialize(profileDir: string, name: string): void
}

function createAcrylFrameworkPackages(installPackageUrl: string): AcrylFrameworkPackages {
  return { materialize: (profileDir, name) => { materializeProfilePackage(profileDir, name, installPackageUrl) } }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolves an ACRYL-owned workspace package by name for a local extension to depend on (see {@link AcrylFrameworkPackages}). */
    acrylFrameworkPackages: AcrylFrameworkPackages
  }
}

/**
 * ACRYL-owned framework packages the app's own committed extensions (`<app home>/extensions/*`) declare
 * through `dsh.requiresAcrylPackages` in their `package.json`. Read at compose time, not through
 * `acryl-extension-context`'s dynamic agent-runtime install path: `livePluginActivation.activate()`'s group
 * resolution (`PluginLifecycleController`'s `bundleGroup()`, a fixed-point-free heuristic over the live Loader
 * tree) failed a real, reproduced activation of `acryl-app-shell` through that path ("invalid plugin... received
 * object") for reasons that trace into vendored Cordis internals this repo does not edit. A static row, inserted
 * the same way the Blueprint's own fixed rows are (`composeBlueprintRows`/`materializeProfilePackage`), sidesteps
 * dynamic activation entirely and is what every one of those fixed rows already relies on successfully.
 * Never throws: a missing or malformed `package.json` is skipped, not fatal to boot.
 */
export function extensionRequiredFrameworkPackages(extensionsDir: string): readonly string[] {
  if (!existsSync(extensionsDir)) return []
  const names = new Set<string>()
  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(extensionsDir, entry.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh?: { requiresAcrylPackages?: unknown } }
      const required = manifest.dsh?.requiresAcrylPackages
      if (Array.isArray(required)) for (const name of required) if (typeof name === 'string') names.add(name)
    } catch { /* a malformed extension package.json is the extension's own problem, reported when it installs, not here */ }
  }
  return [...names]
}

/** Resolve the pinned Harness `web` profile into a mountable composition (the Web flavor). */
async function resolveWebEngineComposition(installPackageUrl: string): Promise<DshEngineComposition> {
  const profileName = 'web'
  // The composition root for the Web surface: the app instance is chosen here, once (see the CLI flavor above).
  const instance = selectInstance()
  process.env.DSH_HOME = instance.dshHome
  process.env.ACRYL_SURFACE = 'web'
  process.env.ACRYL_PROFILE = profileName
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
  initProfile(profileDirectory, webTemplate?.bundles ?? DEFAULT_PROFILE_BUNDLES)
  removeLinkProjections(profileDirectory)
  const profile = loadProfile('web', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  claimProfile(profile.dir, installationRoot(installPackageUrl))
  writeFileSync(rootConfig, profileRoot)
  const profileLayerPatches = profile.layers.flatMap(layer => layer.patches)
  // Same reasoning as the CLI/TUI flavor above: this profile's own bundle may
  // already compose a row ACRYL's own capability table would otherwise insert
  // a second time (spec 034 T008).
  const existingRowIds = new Set(composeEntries([profileLayerPatches]).map(entry => entry.id))
  // Web runs the same ACRYL shell and workspace Desktop does (spec 040, "Surface sharing"): both come from the
  // shared capability declarations, and the ACRYL packages they name are made resolvable from this profile.
  const blueprint = blueprintFromEnvironment(instanceBlueprintEnvironment(instance))
  process.env.ACRYL_BLUEPRINT_ID = blueprint.id
  const webSurfaces = new Set(['web'] as const)
  const capabilities = new Set(blueprint.capabilities)
  const rowsComposition = composeBlueprintRows(blueprint, 'web', existingRowIds)
  for (const packageName of [...acrylCodingCapabilityPackages(webSurfaces, capabilities), ...rowsComposition.packages]) {
    materializeProfilePackage(profile.dir, packageName, installPackageUrl)
  }
  // The app's own committed extensions may each need an ACRYL-owned framework package (see
  // `extensionRequiredFrameworkPackages`'s own doc comment for why this is a static row, not the dynamic
  // agent-runtime install path `acryl-extension-context` otherwise uses).
  const requiredFrameworkPackages = extensionRequiredFrameworkPackages(join(instance.home, 'extensions'))
    .filter(name => !existingRowIds.has(name) && !rowsComposition.packages.includes(name))
  for (const packageName of requiredFrameworkPackages) materializeProfilePackage(profile.dir, packageName, installPackageUrl)
  // A Blueprint that never enables the IDE's own `workspace` capability (every Blank-grown project) keeps the
  // stock `ui-layout` row active, because `createAcrylShellCapabilityPatches`'s disabling patch is gated behind
  // `ACRYL_CODING_CAPABILITIES`' own capability table, which a third-party extension cannot opt into - it is
  // the IDE's, not a general extension mechanism. An extension that requires `acryl-app-shell` is claiming the
  // advanced shell exactly the same way that capability does, so it needs the identical row toggle (measured
  // live: without it, `acryl-app-shell`'s own layout service and the still-active stock one both try to
  // register the `layout` service and the Loader throws "service \"layout\" has been registered").
  const claimsAdvancedShell = requiredFrameworkPackages.includes('acryl-app-shell')
  const patches = structuredClone([
    ...profileLayerPatches,
    ...createAcrylCodingCapabilityPatches(webSurfaces, existingRowIds, capabilities),
    ...createAcrylShellCapabilityPatches(webSurfaces, 'advanced', existingRowIds, capabilities),
    ...requiredFrameworkPackages.map(name => ({ insert: [{ id: name, name }] })),
    ...(claimsAdvancedShell ? [{ id: 'ui-layout', disabled: true }, { id: 'ui-sidebar', disabled: false }, { id: 'ui-conversation', disabled: false }] : []),
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
  // `@deepseek-ai/dsh-client-connection` resolves `webServer` from the Context
  // its own row was built with while registering a caller's
  // `connection.rpc.handle(...)` channel. Cordis resolves an undeclared name
  // only along the provider's fiber chain, and the web server row is a sibling
  // of the connection row, so any third-party profile plugin (for example
  // acryl-dsh-editor-plugin) failed the whole tree with `cannot get property
  // "webServer" without inject`. Same declaration acryl-desktop's
  // prepareDesktopProfile makes for the same row.
  const connectionRow = composeEntries([patches]).find(entry => entry.id === 'connection')
  if (connectionRow?.name === '@deepseek-ai/dsh-client-connection') {
    patches.push({
      id: 'connection',
      name: connectionRow.name,
      inject: withDeclaredDependency(connectionRow.inject, 'webServer'),
    })
  }
  // Every ACRYL-owned row (brand, Market, extension pack, prompt shaping, UI library, shortcuts, mount anchors) comes from
  // the selected Blueprint (spec 036): the row table lives in `blueprint/compose.ts`, and the packages were made resolvable
  // from this profile above (they are ACRYL-owned workspace packages outside @deepseek-ai/dsh's dependency closure, so
  // `healProfilesModuleFallback` cannot find them; see `materializeProfilePackage`).
  patches.push(...rowsComposition.patches)
  // A second instance beside one on the default port (spec 036): ACRYL_WEB_PORT moves the server.
  // The port is part of the app's family: a stable start, and the next free one when it is taken (never a fight with another app).
  if (instance.webPort.scan) {
    const webPort = await findFreeWebPort(instance.webPort.start)
    if (webPort !== instance.webPort.start) process.stdout.write(`ACRYL: port ${String(instance.webPort.start)} is in use, using ${String(webPort)}\n`)
    patches.push(webPortPatch(webPort))
  }
  // Last, so a user override beats every composition decision above it - the
  // same shared store the CLI and the Desktop panel write (spec 034).
  patches.push(...pluginLifecyclePatches({
    profileName,
    statePath: resolvePluginLifecycleStatePath(),
  }))
  return { rootConfig, patches, surface: 'web', instance, installPackageUrl, runtimeResolution: await createProfileRuntimeResolution(profile), productName: blueprint.brand.kind === 'custom' ? blueprint.brand.identity.name : 'ACRYL' }
}

/**
 * Build the `dsh` engine definition for the Web surface's `web` profile
 * (`dsh-base` + `dsh-web-app`) - the same shared `mountDshEngine` primitive
 * as {@link createDshEngineDefinition}, resolved through this package's own
 * profile system like the CLI flavor (Web has no external profile pipeline
 * of its own, unlike Desktop's `prepareDesktopProfile()`).
 * @param installPackageUrl - file URL of `acryl-web`'s own `package.json`,
 * used to materialize `dsh-client-ui-brand-acryl` and `cordis-plugin-market`
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
