export {
  ACRYL_CODING_CAPABILITIES,
  acrylCodingCapabilityPackages,
  createAcrylCodingCapabilityPatches,
  createAcrylShellCapabilityPatches,
  type AcrylCodingCapability,
  type AcrylShellMode,
  type AcrylSurface,
} from './coding-capabilities.ts'
export type {
  DurableSessionMessage,
  DurableSessionMessagePort,
  DurableSessionMessageReceipt,
} from './durable-message.ts'
export {
  createAcrylSessionBridge,
  type AcrylSessionBridge,
  type AcrylSessionBridgeOptions,
} from './session-bridge.ts'
export {
  installSessionLogExporter,
  type InstallSessionLogExporterOptions,
} from './session-log-exporter.ts'
export {
  ACRYL_DEV_HOME_DIR_NAME,
  ACRYL_DSH_ENGINE_DIR_NAME,
  ACRYL_HOME_DIR_NAME,
  applyIsolatedDevHomeDefault,
  resolveAcrylDevDshHome,
  resolveAcrylDshHome,
  resolveAcrylHome,
} from './acryl-home.ts'
export {
  createAcrylEngineHost,
  type AcrylEngineDefinition,
  type AcrylEngineHost,
} from './engine-host.ts'
export {
  createDshEngineDefinition,
  createDshEngineDefinitionFromComposition,
  createProfileRuntimeResolution,
  createWebEngineDefinition,
  extensionRequiredFrameworkPackages,
  materializeProfilePackage,
  type AcrylFrameworkPackages,
  type DshEngineComposition,
} from './engine-dsh.ts'
export {
  PackageOverlayNotFoundError,
  findOverlayPackage,
  packageNameFromSpecifier,
  resolveOverlayPackage,
  type PackageOverlayCandidate,
  type PackageOverlayOptions,
  type PackageOverlaySelection,
  type PackageOverlaySource,
} from './package-overlay.ts'
export {
  installProfilePackageResolver,
  type InstallProfilePackageResolverOptions,
} from './module-resolution.ts'
export {
  provideWebMarketInstall,
  WebPnpmService,
  WebProfilesService,
  type WebMarketPnpm,
  type WebMarketPnpmHandle,
  type WebMarketPnpmOutcome,
  type WebMarketProfile,
} from './web-market-install.ts'
export {
  provideWebMarketPlugins,
  WebLiveActivationService,
  WebPluginsService,
  type WebMarketPluginBundle,
} from './web-market-plugins.ts'
export {
  provideCliMarketInstall,
  CliPnpmService,
  CliProfilesService,
  type CliMarketPnpm,
  type CliMarketPnpmHandle,
  type CliMarketPnpmOutcome,
  type CliMarketProfile,
} from './cli-market-install.ts'
export {
  provideCliMarketPlugins,
  CliLiveActivationService,
  CliPluginsService,
  type CliMarketPluginBundle,
} from './cli-market-plugins.ts'
export {
  createAcrylPluginLifecycle,
  createDshPluginLifecycleHost,
  mountAcrylPluginLifecycle,
  type DshPluginLifecycleOptions,
} from './plugin-lifecycle.ts'
export {
  BASE_TEMPLATE_BUNDLE_NAMES,
  assertProfileName,
  entryPatchId,
  isPluginLifecycleEntryId,
  pluginLifecyclePatches,
  readDisabledPluginLifecycleEntries,
  readUserMutableBundleNames,
  resolvePluginLifecycleStatePath,
  setPluginLifecycleEntryEnabled,
  type PluginLifecycleStatePersistence,
  type ProfileNameValidator,
} from './plugin-lifecycle-state.ts'
export {
  diagnosePluginLifecycle,
  type PluginHealthCode,
  type PluginHealthFinding,
  type PluginHealthInput,
  type PluginHealthReport,
  type PluginHealthSeverity,
} from './plugin-doctor.ts'
// The lifecycle vocabulary itself belongs to `acryl-control`, the domain
// package. Surfaces depend on this runtime, not on the domain package, so the
// shared contract is re-exported here rather than duplicated per surface; one
// `PluginLifecycleError` class has to be the one every surface throws and
// catches, or its `code` stops crossing a route boundary.
export {
  AcrPluginLifecycleService,
  PROTECTED_PLUGIN_ENTRY_REASON,
  PluginLifecycleError,
  type AcrPluginLifecycle,
  type AcrPluginLifecycleController,
  type PluginLifecycleAction,
  type PluginLifecycleEntryRef,
  type PluginLifecycleEntryView,
  type PluginLifecycleErrorCode,
  type PluginLifecycleFiberPhase,
  type PluginLifecycleHost,
  type PluginLifecycleMountedStatus,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from 'acryl-control'

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  DEFAULT_PROFILE_BUNDLES,
  PROFILE_TEMPLATES,
  PluginPackages,
  boot,
  composeEntries,
  initProfile,
  loadProfile,
  removeLinkProjections,
  resolveProfileDir,
  type RuntimeResolution,
} from '@deepseek-ai/dsh-app-boot'

import { createProfileRuntimeResolution } from './engine-dsh.ts'
import { selectInstance, type AppInstance } from './instance/index.ts'
import {
  acrylCodingCapabilityPackages,
  createAcrylCodingCapabilityPatches,
  createAcrylShellCapabilityPatches,
} from './coding-capabilities.ts'
import { materializeProfilePackage } from './engine-dsh.ts'
import { installAcrylWorkspaceStatusTool } from './plugin-acryl-workspace-status.ts'
import { installSessionLogExporter } from './session-log-exporter.ts'

const require = createRequire(import.meta.url)
const dshInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')
const profileRoot = '[]\n'

export interface BootAcrylHarnessProfileOptions {
  readonly profile: string
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

/**
 * Provide the chosen app instance and the profile's package table (DSH 0.2 answers every bare-package import from it, as stock
 * `dsh` mounts it in its own boot step) before any profile entry mounts, then run the caller's own host setup.
 */
function withAppInstance(
  instance: AppInstance,
  resolution: RuntimeResolution,
  prepare?: (ctx: Context) => Promise<void> | void,
): (ctx: Context) => Promise<void> {
  return async ctx => {
    ctx.provide('appInstance', instance)
    await ctx.plugin(PluginPackages, { resolution })
    await prepare?.(ctx)
  }
}

export interface AcrylHarnessRuntime {
  readonly ctx: Context
  readonly profileDirectory: string
  dispose(): Promise<void>
}

/** Boot one normal pinned-Harness ACRYL profile in a single Cordis root. */
export async function bootAcrylHarnessProfile(
  options: BootAcrylHarnessProfileOptions,
): Promise<AcrylHarnessRuntime> {
  if (options.profile.trim() === '') throw new Error('ACRYL Harness profile must not be empty')
  // This boot is its own composition root: it chooses the app instance once and provides it to plugins (runtime instance/).
  const instance = selectInstance()
  process.env.DSH_HOME = instance.dshHome
  const profileDirectory = resolveProfileDir(options.profile)
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  removeLinkProjections(profileDirectory)
  const profile = loadProfile('acryl', options.profile, dshInstallAnchor)
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
  const ctx = await boot('acryl', rootConfig, patches, withAppInstance(instance, await createProfileRuntimeResolution(profile), options.prepare))
  if ((ctx as { tools?: unknown }).tools) installAcrylWorkspaceStatusTool(ctx)
  installSessionLogExporter(ctx, { surface: 'tui' })
  let disposed = false
  return Object.freeze({
    ctx,
    profileDirectory: profile.dir,
    async dispose() {
      if (disposed) return
      disposed = true
      await ctx.fiber.dispose()
    },
  })
}

export interface BootAcrylWebProfileOptions {
  /** Inner arguments handed to the web-startup provider (e.g. `['--port', '4000']`). Defaults to no flags. */
  readonly cmdlineArgs?: readonly string[]
  /** Host setup run after Loader installation and before any config-tree entry mounts. */
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

export interface AcrylWebRuntime {
  readonly ctx: Context
  /** The canonical bind URL, e.g. `http://127.0.0.1:3080`. */
  readonly url: string
  readonly profileDirectory: string
  dispose(): Promise<void>
}

/**
 * Boot the DSH browser surface (the `web` profile: `dsh-base` + `dsh-web-app`)
 * as one normal ACRYL runtime, so `pnpm acryl-web` serves the same DSH
 * HTTP/WebSocket seam the web surface always uses. The shipped Web profile
 * already owns its system prompt, agent-preset roster, and session stats, so
 * the shared factory contributes only the missing authorization seam here.
 */
export async function bootAcrylWebProfile(
  options: BootAcrylWebProfileOptions = {},
): Promise<AcrylWebRuntime> {
  const profileName = 'web'
  // This boot is its own composition root: it chooses the app instance once and provides it to plugins (runtime instance/).
  const instance = selectInstance()
  process.env.DSH_HOME = instance.dshHome
  const profileDirectory = resolveProfileDir(profileName)
  // See engine-dsh.ts's resolveWebEngineComposition for the full rationale:
  // DEFAULT_PROFILE_BUNDLES (dsh-base only) pre-empts loadProfile()'s own
  // correct PROFILE_TEMPLATES.web-based auto-init (dsh-base + dsh-web-app),
  // leaving a fresh 'web' profile with no dsh-client-connection/webStartup -
  // ctx.get('connection') and ctx.get('webStartup') are never defined, and
  // the served index falls back to its own "authentication required" message.
  const webTemplate = PROFILE_TEMPLATES.web
  initProfile(profileDirectory, webTemplate?.bundles ?? DEFAULT_PROFILE_BUNDLES)
  removeLinkProjections(profileDirectory)
  const profile = loadProfile('web', profileName, dshInstallAnchor)
  const rootConfig = join(profile.dir, 'cordis.yml')
  writeFileSync(rootConfig, profileRoot)
  // Same composition as the engine-host Web path: the shared workspace and shell declarations, with the ACRYL
  // packages they name made resolvable from this profile.
  const webSurfaces = new Set(['web'] as const)
  for (const packageName of acrylCodingCapabilityPackages(webSurfaces)) {
    materializeProfilePackage(profile.dir, packageName, import.meta.url)
  }
  const patches = structuredClone([
    ...profile.layers.flatMap(layer => layer.patches),
    ...createAcrylCodingCapabilityPatches(webSurfaces),
    ...createAcrylShellCapabilityPatches(webSurfaces, 'advanced'),
    ...profile.patches,
  ])
  const cmdlineArgs = options.cmdlineArgs ?? []
  const ctx = await boot('web', rootConfig, patches, withAppInstance(instance, await createProfileRuntimeResolution(profile), hostCtx => {
    provideCmdline(hostCtx, { args: [...cmdlineArgs], exit: code => { process.exitCode = code } })
    return options.prepare?.(hostCtx)
  }))
  if ((ctx as { tools?: unknown }).tools) installAcrylWorkspaceStatusTool(ctx)
  installSessionLogExporter(ctx, { surface: 'web' })
  const startup = ctx.get('webStartup') as { host?: string; port?: number } | undefined
  const host = startup?.host ?? '127.0.0.1'
  const port = startup?.port ?? instance.webPort.start
  const url = `http://${host}:${port}`
  let disposed = false
  return Object.freeze({
    ctx,
    url,
    profileDirectory: profile.dir,
    async dispose() {
      if (disposed) return
      disposed = true
      await ctx.fiber.dispose()
    },
  })
}
export {
  captureSystemPrompt,
  renderSystemPromptDoc,
  type CaptureSystemPromptOptions,
  type CapturedSystemPrompt,
} from './system-prompt-capture.ts'
export { pinnedPnpmEnv, resolvePinnedPnpm, type PinnedPnpm } from './pinned-pnpm.ts'
export { reconcileProfileLayout, type LayoutChange } from './profile-layout.ts'
export {
  BLANK_BLUEPRINT,
  IDE_BLUEPRINT,
  BLUEPRINT_ROW_IDS,
  InvalidBlueprintError,
  InvalidBrandIdentityError,
  UnknownBlueprintError,
  appManifest,
  blueprintFromManifest,
  catalogWithStarters,
  isBlendsManifest,
  parseBlueprint,
  readBlueprintFile,
  readStarters,
  blueprintFromEnvironment,
  brandIdentity,
  builtInCatalog,
  composeBlueprintRows,
  identityLine,
  selectBlueprint,
  withBrand,
  type Blueprint,
  type BlueprintBrand,
  type BlueprintCatalog,
  type BlueprintComposition,
  type BlueprintRowId,
  type BrandIdentity,
} from './blueprint/index.ts'
export {
  SAFE_RECIPES,
  applyRepairPlan,
  backupsDir,
  createBackup,
  describePlan,
  inspectProfile,
  isSafeRecipe,
  listBackups,
  planRepairs,
  restoreBackup,
  undoRepair,
} from './profile-repair/index.ts'
export type {
  BackupEntry,
  BackupManifest,
  InspectOptions,
  ProfileDiagnosis,
  ProfileFinding,
  ProfileFindingCode,
  RecipeId,
  RepairPlan,
  RepairResult,
  RepairStep,
} from './profile-repair/index.ts'
export { WEB_PORT_ATTEMPTS, findFreeWebPort, loopbackPortIsFree, webPortPatch } from './web-port.ts'
export { APP_EXTENSIONS_DIR, APP_MANIFEST_FILE, NewAppError, planNewApp, writeNewApp, type LauncherFile, type NewAppOptions, type PlannedApp } from './app/new-app.ts'
export { PROFILE_OWNER_FILE, ProfileInUseError, claimProfile, type ProfileOwner } from './profile-owner.ts'
export {
  APP_DEFINITION_FILE,
  AppInstanceError,
  LockHeldError,
  acquireLock,
  announce,
  appFolder,
  appFolderInstance,
  appName,
  defaultInstance,
  developmentInstance,
  instanceEnvironment,
  isGitWorktree,
  listRunning,
  managedApp,
  ONLINE_SECRET_FILE_NAME,
  onlineSecretPath,
  osHomeDirectory,
  pinnedInstance,
  processIsAlive,
  profileDir,
  readLock,
  readOnlineSecret,
  releaseLock,
  removeOnlineSecret,
  runLockFileForDshHome,
  selectInstance,
  stablePort,
  withdraw,
  worktreeInstance,
  writeOnlineSecret,
  type AppInstance,
  type AppInstanceKind,
  type LockHolder,
  type RunningApp,
  type SelectInstanceOptions,
} from './instance/index.ts'
export { PUBLIC_REGISTRY, StartSourceError, classifyStartSource, gitClone, resolveStartSource, type GitClone, type ResolvedStartSource, type StartSource } from './app/start-source.ts'
