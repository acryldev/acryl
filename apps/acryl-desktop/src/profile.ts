/** Compatibility profile composition over the official Web bundle and user plugins. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluate, isJsExpr, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  composeEntries,
  initProfile,
  loadOptionalPatches,
  loadOverlayPatches,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  bundlePatchPaths,
  readProfileManifest,
  removeLinkProjections,
  resolveProfileDir,
  writeProfileManifest,
  type Profile,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { blueprintFromEnvironment, composeBlueprintRows, createAcrylCodingCapabilityPatches, createAcrylShellCapabilityPatches, extensionRequiredFrameworkPackages, materializeProfilePackage, pluginLifecyclePatches, type Blueprint } from 'acryl-harness-runtime'
import { parseDocument } from 'yaml'
import { unpackedAsarPath } from './runtime/packaged-runtime-path.ts'
import { findOverlayPackage, resolveOverlayPackage } from './plugins/package-overlay.ts'
import { DESKTOP_DEFAULT_WEB_PORT } from './runtime/desktop-port.ts'
import type { DesktopShellMode } from './shell/runtime.ts'
import {
  activeDesktopProfileLayers,
  desktopPluginBundleMutable,
  readDesktopDisabledBundles,
} from './plugins/desktop-plugins.ts'
import {
  DESKTOP_MARKET_IDENTITIES,
  desktopMarketSnapshotWithEffective,
  type DesktopMarketProvider,
  type DesktopMarketSnapshot,
} from './plugins/desktop-market.ts'
import {
  assertNoBlendRowCollisions,
  blendInsertPatch,
  readDesktopBlend,
  type DesktopBlendProjection,
} from './profile/desktop-blend.ts'

/** Persistent profile managed by the desktop launcher and the ordinary dsh plugin command. */
export const DESKTOP_PROFILE_NAME = 'desktop'

/** Standalone package name inserted through the launcher-owned desktop layer. */
export const DESKTOP_PACKAGE_NAME = 'acryl-desktop'

/** Empty include root rewritten before every profile boot. */
export const DESKTOP_PROFILE_ROOT = 'cordis.yml'

const BIN_NAME = DESKTOP_PACKAGE_NAME
const REQUIRED_BUNDLES = requiredWebBundles()
const REQUIRED_BUNDLE_SET = new Set(REQUIRED_BUNDLES)
const OBSOLETE_DESKTOP_BUNDLE_SET = new Set(['@deepseek-ai/dsh-desktop-app'])
const INSTALL_ANCHOR = unpackedAsarPath(fileURLToPath(new URL('../package.json', import.meta.url)))
const DESKTOP_PATCH_PATH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const DIRECTORY_PICKER_ROW_ID = 'directory-picker'
const AUTO_PICKER_PACKAGE = '@deepseek-ai/dsh-host-directory-picker-auto'
const BROWSE_PICKER_BACKEND = '@deepseek-ai/dsh-host-directory-picker-browse'
const BROWSE_PICKER_SURFACE = '@deepseek-ai/dsh-client-ui-directory-picker-browse'
const PWSH_SANDBOX_ROW_ID = 'pwsh-sandbox'
const UPSTREAM_PWSH_SANDBOX_PACKAGE = '@deepseek-ai/dsh-pwsh-sandbox'
/**
 * DETACHED on the DSH 0.2 branch (spec 001 R25): the Desktop ACL-runner trampoline overrides `runArgv`/`startArgv` of the upstream
 * `SandboxPwshExecutor`, which 0.2 no longer exposes. Windows keeps the upstream executor until the trampoline is re-ported to the
 * new spawn seam; then set this to true (and drop the `exclude` of `src/windows-pwsh-sandbox.ts` in tsconfig.json).
 */
const WINDOWS_PWSH_SANDBOX_REATTACHED = false
const DESKTOP_WINDOWS_PWSH_SANDBOX_ROW_ID = 'desktop-windows-pwsh-sandbox'
const DESKTOP_WINDOWS_PWSH_SANDBOX_PACKAGE = 'acryl-desktop/windows-pwsh-sandbox'
const AGENT_PRESETS_ROW_ID = 'agent-preset-registry'
const UPSTREAM_AGENT_PRESETS_PACKAGE = '@deepseek-ai/dsh-agent-preset-registry'
const DESKTOP_WINDOWS_AGENT_PRESETS_ROW_ID = 'desktop-windows-agent-presets'
const DESKTOP_WINDOWS_AGENT_PRESETS_PACKAGE = 'acryl-desktop/windows-agent-presets'
// DETACHED default on the DSH 0.2 branch (spec 001 R25): the advanced frame is not composed, so Desktop starts on the stock frame.
// Restore `'advanced'` (here, in `src/index.ts` and in `cordis.patch.yml`) together with the `advanced-shell` capability.
const DEFAULT_DESKTOP_SHELL_MODE: DesktopShellMode = 'compatibility'
const DEFAULT_DESKTOP_PORT = DESKTOP_DEFAULT_WEB_PORT
const DESKTOP_WEB_SERVER_ROW_ID = 'desktop-webserver'
const DESKTOP_WEB_SERVER_PACKAGE = 'acryl-desktop/webserver'
const CONNECTION_ROW_ID = 'connection'
const UPSTREAM_CONNECTION_PACKAGE = '@deepseek-ai/dsh-client-connection'
/** File name of ACRYL's own preferences inside the ACRYL home (written by the `acryl-settings` plugin). */
const ACRYL_SETTINGS_FILENAME = 'acryl-settings.yaml'
const DESKTOP_SETTINGS_NAMESPACE = 'dsh-desktop'
const UI_LAYOUT_PACKAGE = '@deepseek-ai/dsh-client-ui-layout'
const UI_SIDEBAR_PACKAGE = '@deepseek-ai/dsh-client-ui-sidebar'
const UI_CONVERSATION_PACKAGE = '@deepseek-ai/dsh-client-ui-conversation'
const UI_BRAND_OFFICIAL_ROW_ID = 'ui-brand-official'
const DEFAULT_DESKTOP_MARKET_SNAPSHOT: DesktopMarketSnapshot = Object.freeze({
  requested: 'disabled',
  effective: 'disabled',
  legacyDefaulted: true,
})
const MARKET_ROW_IDS: ReadonlySet<string> = new Set([
  DESKTOP_MARKET_IDENTITIES.community.rowId,
  DESKTOP_MARKET_IDENTITIES.dshMarket.rowId,
])
const MARKET_PACKAGE_NAMES: ReadonlySet<string> = new Set([
  DESKTOP_MARKET_IDENTITIES.community.packageName,
  DESKTOP_MARKET_IDENTITIES.dshMarket.packageName,
])

/**
 * Parse desktop presentation state and reject corrupted values.
 * @param value - untrusted settings value.
 * @returns a supported desktop shell mode.
 */
export function parseDesktopShellMode(value: unknown): DesktopShellMode {
  if (value === undefined) return DEFAULT_DESKTOP_SHELL_MODE
  if (value === 'compatibility' || value === 'advanced') return value
  throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE}.mode must be "compatibility" or "advanced"`)
}

/** Parse the requested loopback Web port and reject values Node cannot listen on. */
export function parseDesktopPort(value: unknown): number {
  if (value === undefined) return DEFAULT_DESKTOP_PORT
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65_535) return value
  throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE}.port must be an integer from 0 through 65535`)
}

/** Startup settings projected into the Loader graph before the settings plugin boots. */
export interface DesktopStartupSettings {
  mode: DesktopShellMode
  port: number
  /** BLEND selection: path to an owned Blend directory or lock file, or null. */
  blend: string | null
}

/** Parse the requested BLEND selection and reject malformed values. */
export function parseDesktopBlend(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value.length > 0 && value.length <= 4096) return value
  throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE}.blend must be a non-empty path of at most 4096 characters`)
}

/**
 * Read Desktop startup settings from one parsed settings document.
 * @param document - untrusted settings document root.
 * @returns validated mode, port, and BLEND selection for the next generation.
 */
export function desktopStartupSettingsFromSettings(document: unknown): DesktopStartupSettings {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error(`${BIN_NAME}: settings document must be a map of namespace sections`)
  }
  const section = (document as Record<string, unknown>)[DESKTOP_SETTINGS_NAMESPACE]
  if (section === undefined) {
    return { mode: DEFAULT_DESKTOP_SHELL_MODE, port: DEFAULT_DESKTOP_PORT, blend: null }
  }
  if (typeof section !== 'object' || section === null || Array.isArray(section)) {
    throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE} settings must be a map`)
  }
  const values = section as Record<string, unknown>
  return {
    mode: parseDesktopShellMode(values.mode),
    port: parseDesktopPort(values.port),
    blend: parseDesktopBlend(values.blend),
  }
}

/** Read only the shell mode from one parsed settings document. */
export function desktopShellModeFromSettings(document: unknown): DesktopShellMode {
  return desktopStartupSettingsFromSettings(document).mode
}

/**
 * Read startup settings from ACRYL's own preferences file.
 * @param filename - absolute path of `acryl-settings.yaml`; a missing file means every default.
 * @returns the values projected into the startup Loader graph.
 */
export function readDesktopStartupSettings(filename: string): DesktopStartupSettings {
  let text: string
  try {
    text = readFileSync(filename, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return { mode: DEFAULT_DESKTOP_SHELL_MODE, port: DEFAULT_DESKTOP_PORT, blend: null }
    }
    throw cause
  }
  const parsed = parseDocument(text, { prettyErrors: true })
  if (parsed.errors.length > 0) {
    throw new Error(`${BIN_NAME}: invalid settings document at ${filename}: ${parsed.errors.map(error => error.message).join('; ')}`)
  }
  return desktopStartupSettingsFromSettings(parsed.toJS() ?? {})
}

/** Read only the shell mode from ACRYL's preferences file. */
export function readDesktopShellMode(filename: string): DesktopShellMode {
  return readDesktopStartupSettings(filename).mode
}

/** Resolve the public Web template once and reject an incompatible DSH release. */
function requiredWebBundles(): string[] {
  const template = PROFILE_TEMPLATES.web
  if (template === undefined) {
    throw new Error(`${BIN_NAME}: installed dsh-app-boot has no web profile template`)
  }
  return [...template.bundles]
}

/** Prepared profile inputs consumed by app-boot. */
export interface PreparedDesktopProfile {
  /** Harness home shared by the launcher and generated command environment. */
  homeDir: string
  /** Resolved profile and its persistent user layer. */
  profile: Profile
  /** Absolute empty root config included by the Cordis Loader. */
  rootConfig: string
  /** Profile-owned parent URL used to resolve bare Cordis plugin packages. */
  bareModuleBaseUrl: string
  /** Complete ordered patch list for this desktop generation. */
  patches: PatchOptions[]
  /** Optional Client UI entries skipped because this profile cannot resolve them. */
  skippedOptionalEntries: SkippedOptionalEntry[]
  /** Persisted shell mode applied after every user-owned patch. */
  mode: DesktopShellMode
  /** Persisted loopback Web port applied to every startup consumer. */
  port: number
  /** Resolved file-backed settings document used by this generation. */
  settingsDocument: string
  /** Requested provider and the fail-closed provider effective for this generation. */
  market: DesktopMarketSnapshot
  /** Internal boot diagnostic when the requested provider was disabled. */
  marketFailure?: string
  /** Trusted lock projection for the configured BLEND, when one is selected. */
  blend?: DesktopBlendProjection
  /**
   * Settles when the profiles' module-fallback links are in place. Preparation itself stays synchronous; every caller that boots the profile awaits
   * this first, because a fresh home (a new app's first start, a smoke's temporary home) has no links yet and would fail to resolve its packages.
   * Never rejects: a failed repair surfaces as the boot's own resolution error.
   */
  moduleFallback: Promise<void>
}

/** Optional observations emitted before profile preparation can fail. */
export interface DesktopProfilePreparationHooks {
  /** Receive the trusted settings path before its contents are parsed. */
  onSettingsDocumentResolved?: (path: string) => void
  /** Desktop-private managed-entry state applied after all ordinary profile patches. */
  pluginLifecycleStatePath?: string
}

/** User patch entry skipped to keep a profile bootable. */
export interface SkippedOptionalEntry {
  /** Loader row id from the skipped entry. */
  id?: string
  /** Package name from the skipped entry. */
  name: string
}

/**
 * Normalize the installation-owned prefix while preserving third-party order.
 * @param current - current persistent bundle list.
 * @returns base, Web carrier, then every third-party bundle in prior order.
 */
export function desktopBundleList(current: readonly string[]): string[] {
  const thirdParty = current.filter(name => !REQUIRED_BUNDLE_SET.has(name)
    && name !== DESKTOP_PACKAGE_NAME
    && !OBSOLETE_DESKTOP_BUNDLE_SET.has(name))
  return [...REQUIRED_BUNDLES, ...thirdParty]
}

/** Return whether two ordered string lists are identical. */
function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * A profile's own `pnpm-workspace.yaml` (from `initProfile`'s fixed upstream
 * template) never allows any dependency's install/postinstall script to run -
 * pnpm's own security default for a bare `add`. `acryl-development-canvas`
 * needs `node-pty`'s real native build to do anything useful; without this,
 * pnpm silently skips it (`ERR_PNPM_IGNORED_BUILDS`), and the Market's own
 * post-install `assertInstalledBundle` check then rejects the bundle as
 * invalid and rolls the whole install back - surfaced to the user as the
 * generic "The desktop package manager did not complete successfully",
 * reproduced directly against a real Market install. `initProfile` itself
 * takes no template-override parameter (its signature is fixed upstream), so
 * this repairs the file the same way `ensureDesktopProfile` already repairs
 * `dsh.profile.bundles` below - idempotently, on every boot, not just at
 * first creation, so an existing profile self-heals too.
 * @param dir - the profile directory.
 */
function ensureProfileAllowsNativeBuilds(dir: string): void {
  const path = join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const document = parseDocument(readFileSync(path, 'utf8'), { prettyErrors: true })
  if (document.getIn(['allowBuilds', 'node-pty']) === true) return
  document.setIn(['allowBuilds', 'node-pty'], true)
  writeFileSync(path, document.toString())
}

/**
 * Initialize or repair the persistent desktop profile.
 * @param home - Harness home containing the profiles directory.
 * @returns the absolute profile directory.
 */
export function ensureDesktopProfile(home: string = resolveDshHome()): string {
  const dir = resolveProfileDir(DESKTOP_PROFILE_NAME, home)
  if (!existsSync(join(dir, 'package.json'))) initProfile(dir, REQUIRED_BUNDLES)
  ensureProfileAllowsNativeBuilds(dir)
  const manifest = readProfileManifest(BIN_NAME, dir)
  const rawBundles = (manifest.dsh?.profile as { bundles?: unknown } | undefined)?.bundles
  if (rawBundles !== undefined
    && (!Array.isArray(rawBundles) || rawBundles.some(value => typeof value !== 'string'))) {
    throw new Error(`${BIN_NAME}: dsh.profile.bundles must be an array of package names`)
  }
  const current = rawBundles === undefined ? [] : rawBundles as string[]
  const bundles = desktopBundleList(current)
  if (!sameList(current, bundles)) {
    writeProfileManifest(dir, {
      ...manifest,
      dsh: {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles,
        },
      },
    })
  }
  return dir
}

interface RecoveryFilteredProfile {
  readonly profile: Profile
  readonly dshMarketFailure?: string
}

/** Render one provider failure without leaking an arbitrary thrown object into public state. */
function marketFailureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Load a profile while resolving disabled third-party bundles only after they have been filtered.
 * Every direct bundle uses the same Desktop/Profile SemVer overlay that Loader imports use.
 * The `dshmarket` bundle is filtered before resolution unless explicitly selected.
 */
function loadRecoveryFilteredProfile(
  profileName: string,
  profileDir: string,
  disabledBundles: ReadonlySet<string>,
  marketProvider: DesktopMarketProvider,
): RecoveryFilteredProfile {
  if (!existsSync(join(profileDir, 'package.json'))) {
    const template = PROFILE_TEMPLATES[profileName]
    if (template === undefined) {
      throw new Error(`${BIN_NAME}: profile ${JSON.stringify(profileName)} does not exist`)
    }
    initProfile(profileDir, template.bundles)
  }
  ensureProfileAllowsNativeBuilds(profileDir)
  const manifest = readProfileManifest(BIN_NAME, profileDir)
  const rawBundles = (manifest.dsh?.profile as { bundles?: unknown } | undefined)?.bundles
  if (rawBundles !== undefined
    && (!Array.isArray(rawBundles) || rawBundles.some(value => typeof value !== 'string'))) {
    throw new Error(`${BIN_NAME}: dsh.profile.bundles must be an array of package names`)
  }
  const bundles = (rawBundles ?? []) as string[]
  const selectedBundles = bundles.filter(packageName =>
    packageName !== DESKTOP_MARKET_IDENTITIES.community.packageName
    && (marketProvider === DESKTOP_MARKET_IDENTITIES.dshMarket.provider
      || packageName !== DESKTOP_MARKET_IDENTITIES.dshMarket.packageName),
  )
  if (marketProvider === DESKTOP_MARKET_IDENTITIES.dshMarket.provider
    && !selectedBundles.includes(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName)) {
    selectedBundles.push(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName)
  }
  const layers: Profile['layers'] = []
  let dshMarketFailure: string | undefined
  const installPackageUrl = pathToFileURL(INSTALL_ANCHOR).href
  const profilePackageUrl = pathToFileURL(join(profileDir, 'package.json')).href
  for (const packageName of selectedBundles) {
    const isDshMarket = packageName === DESKTOP_MARKET_IDENTITIES.dshMarket.packageName
    if (!isDshMarket && desktopPluginBundleMutable(packageName) && disabledBundles.has(packageName)) continue
    try {
      const packageDir = resolveOverlayPackage(packageName, {
        installPackageUrl,
        profilePackageUrl,
      }).selected.packageDir
      const bundleManifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
      if (isDshMarket && (bundleManifest === null || typeof bundleManifest !== 'object'
        || Array.isArray(bundleManifest)
        || (bundleManifest as { name?: unknown }).name !== DESKTOP_MARKET_IDENTITIES.dshMarket.packageName)) {
        throw new Error(`${BIN_NAME}: selected dshmarket bundle has an invalid package identity`)
      }
      const bundle = bundleManifest !== null && typeof bundleManifest === 'object'
        ? (bundleManifest as { dsh?: { bundle?: Parameters<typeof bundlePatchPaths>[1] } }).dsh?.bundle
        : undefined
      if (bundle === undefined) {
        throw new Error(`${BIN_NAME}: profile bundle ${JSON.stringify(packageName)} declares no dsh.bundle in its package.json`)
      }
      // A bundle declares one patch file or an ordered list (DSH 0.2: dsh-web-app ships its presets as extra files); the
      // layer keeps every file's patches concatenated in application order, exactly like upstream's own `loadProfile`.
      const patchPaths = bundlePatchPaths(packageDir, bundle)
      layers.push({
        packageName,
        packageDir,
        patchPaths,
        patches: patchPaths.flatMap(patchPath => loadOverlayPatches(BIN_NAME, patchPath)),
      })
    } catch (cause) {
      if (!isDshMarket) throw cause
      dshMarketFailure = marketFailureMessage(cause)
    }
  }
  const patchPath = join(profileDir, PROFILE_PATCH_FILENAME)
  return {
    profile: {
      name: profileName,
      dir: profileDir,
      layers,
      patchPath,
      patches: existsSync(patchPath) ? loadOverlayPatches(BIN_NAME, patchPath) : [],
      // This pipeline throws on an unloadable bundle (except the optional market, reported through `dshMarketFailure`),
      // so nothing is ever skipped silently.
      skippedBundles: [],
    },
    ...(dshMarketFailure === undefined ? {} : { dshMarketFailure }),
  }
}

/** Read a row's object config without trusting arbitrary YAML values. */
function rowConfig(row: EntryOptions | undefined): Record<string, unknown> {
  const config = row?.config
  return config !== null && typeof config === 'object' && !Array.isArray(config)
    ? config as Record<string, unknown>
    : {}
}

/**
 * Add one declared dependency to a Loader row's `inject` metadata.
 *
 * A patch replaces the whole value, so the row's own declaration is preserved
 * in either the list or the map form Cordis accepts.
 */
function withDeclaredDependency(inject: unknown, name: string): string[] | Record<string, unknown> {
  if (Array.isArray(inject)) return inject.includes(name) ? [...inject] : [...inject, name]
  if (inject !== null && typeof inject === 'object') {
    const declared = inject as Record<string, unknown>
    return name in declared ? { ...declared } : { ...declared, [name]: null }
  }
  return [name]
}

/** Resolve a Loader row's platform gate without mutating the host process. */
function rowDisabledOnPlatform(row: EntryOptions, platform: NodeJS.Platform): boolean {
  if (!isJsExpr(row.disabled)) return row.disabled === true
  const scopedProcess = new Proxy(process, {
    get(target, property) {
      if (property === 'platform') return platform
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return Boolean(evaluate({ process: scopedProcess }, row.disabled.__jsExpr))
}

/** Reject duplicate entries before the Loader turns them into a startup crash. */
function assertUniqueEntryIds(rows: readonly EntryOptions[]): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (typeof row.id === 'string') {
      if (seen.has(row.id)) {
        throw new Error(`${BIN_NAME}: duplicate loader entry id "${row.id}" in the composed profile`)
      }
      seen.add(row.id)
    }
    if (row.group === true && Array.isArray(row.config)) {
      assertUniqueEntryIds(row.config)
    }
  }
}

/** Return whether a Loader specifier names an npm package. */
function isBarePackageSpecifier(name: string): boolean {
  return !name.startsWith('.')
    && !name.startsWith('/')
    && !name.startsWith('#')
    && !URL.canParse(name)
}

/** Return whether a package is a user-facing Client UI extension, not a Host provider. */
function isOptionalClientPackage(name: string): boolean {
  return /^(@[^/]+\/)?dsh-client-ui-/u.test(name)
}

/** Drop unresolved optional Client UI rows from the machine-wide patch only. */
function omitUnresolvedOptionalEntries(
  patches: PatchOptions[],
  profilePackageUrl: string,
): { patches: PatchOptions[], skipped: SkippedOptionalEntry[] } {
  const skipped: SkippedOptionalEntry[] = []
  const installPackageUrl = pathToFileURL(INSTALL_ANCHOR).href

  const filterRows = (rows: EntryOptions[]): EntryOptions[] => {
    const filtered: EntryOptions[] = []
    for (const row of rows) {
      if (typeof row.name === 'string'
        && isBarePackageSpecifier(row.name)
        && isOptionalClientPackage(row.name)
        && findOverlayPackage(row.name, { installPackageUrl, profilePackageUrl }) === undefined) {
        skipped.push({
          ...(typeof row.id === 'string' ? { id: row.id } : {}),
          name: row.name,
        })
        continue
      }
      const config = row.group === true && Array.isArray(row.config) ? filterRows(row.config) : undefined
      filtered.push(config === undefined ? row : { ...row, config })
    }
    return filtered
  }

  return {
    patches: patches.flatMap((patch) => {
      if (!Array.isArray(patch.insert)) return [patch]
      const insert = filterRows(patch.insert)
      return [{ ...patch, insert }]
    }),
    skipped,
  }
}

interface MarketPatchFilter {
  readonly patches: PatchOptions[]
  readonly removedProviderReference: boolean
}

/** Return whether one Loader row claims either Desktop-owned Market identity. */
function isMarketProviderEntry(entry: { readonly id?: unknown, readonly name?: unknown }): boolean {
  return (typeof entry.id === 'string' && MARKET_ROW_IDS.has(entry.id))
    || (typeof entry.name === 'string' && MARKET_PACKAGE_NAMES.has(entry.name))
}

/** Remove provider rows recursively before an untrusted patch can activate either implementation. */
function filterMarketProviderRows(rows: EntryOptions[]): {
  rows: EntryOptions[]
  removedProviderReference: boolean
} {
  const filtered: EntryOptions[] = []
  let removedProviderReference = false
  for (const row of rows) {
    if (isMarketProviderEntry(row)) {
      removedProviderReference = true
      continue
    }
    if (row.group === true && Array.isArray(row.config)) {
      const nested = filterMarketProviderRows(row.config)
      removedProviderReference ||= nested.removedProviderReference
      filtered.push(nested.removedProviderReference ? { ...row, config: nested.rows } : row)
    } else {
      filtered.push(row)
    }
  }
  return { rows: filtered, removedProviderReference }
}

/** Strip provider inserts and overrides from every non-provider layer. */
function filterMarketProviderPatches(patches: PatchOptions[]): MarketPatchFilter {
  const filtered: PatchOptions[] = []
  let removedProviderReference = false
  for (const patch of patches) {
    if (isMarketProviderEntry(patch)) {
      removedProviderReference = true
      continue
    }
    if (Array.isArray(patch.insert)) {
      const insert = filterMarketProviderRows(patch.insert)
      removedProviderReference ||= insert.removedProviderReference
      filtered.push(insert.removedProviderReference ? { ...patch, insert: insert.rows } : patch)
    } else {
      filtered.push(patch)
    }
  }
  return { patches: filtered, removedProviderReference }
}

/** Accept only the audited single-row contract from the selected direct bundle layer. */
export function validateDshMarketBundlePatches(patches: readonly PatchOptions[]): void {
  const rows = composeEntries([[...patches]])
  const row = rows[0]
  if (rows.length !== 1 || row === undefined
    || row.id !== DESKTOP_MARKET_IDENTITIES.dshMarket.rowId
    || row.name !== DESKTOP_MARKET_IDENTITIES.dshMarket.packageName
    || Object.keys(row).some(key => key !== 'id' && key !== 'name')) {
    throw new Error(`${BIN_NAME}: dshmarket bundle patch must insert exactly the canonical dsh-market row`)
  }
}

/** Ensure a Desktop dependency is resolvable through the selected profile fallback. */
function validateMarketPackage(name: string, profilePackageUrl: string): string | undefined {
  try {
    resolveOverlayPackage(name, {
      installPackageUrl: pathToFileURL(INSTALL_ANCHOR).href,
      profilePackageUrl,
    })
  } catch (cause) {
    return `${BIN_NAME}: cannot resolve selected Market package ${name}: ${marketFailureMessage(cause)}`
  }
}

/** Assert the final graph contains only the provider selected by the launcher. */
function assertEffectiveMarketRows(
  rows: readonly EntryOptions[],
  effective: DesktopMarketProvider,
): void {
  const providers = rows.filter(isMarketProviderEntry)
  if (effective === 'disabled') {
    if (providers.length !== 0) throw new Error(`${BIN_NAME}: disabled Market provider leaked into the Loader graph`)
    return
  }
  const identity = effective === DESKTOP_MARKET_IDENTITIES.community.provider
    ? DESKTOP_MARKET_IDENTITIES.community
    : DESKTOP_MARKET_IDENTITIES.dshMarket
  if (providers.length !== 1 || providers[0]?.id !== identity.rowId
    || providers[0]?.name !== identity.packageName) {
    throw new Error(`${BIN_NAME}: selected Market provider did not compose to one canonical Loader row`)
  }
}

/**
 * Load and compose one desktop profile generation.
 * @param telemetryDisabled - inherited DSH telemetry opt-out value.
 * @param home - Harness home containing profiles and the machine-wide patch.
 * @param platform - native platform selecting launcher-owned safety overlays.
 * @param profileName - existing or lazily available Web profile to compose.
 * @param pluginStatePath - optional Desktop-private disabled-bundle state.
 * @param marketSelection - machine-level provider request fixed for this generation.
 * @returns root config, profile metadata, and ordered patches.
 */
export function prepareDesktopProfile(
  telemetryDisabled: string | undefined = process.env.DSH_TELEMETRY_DISABLED,
  home: string = resolveDshHome(),
  platform: NodeJS.Platform = process.platform,
  profileName: string = DESKTOP_PROFILE_NAME,
  pluginStatePath?: string,
  marketSelection: DesktopMarketSnapshot = DEFAULT_DESKTOP_MARKET_SNAPSHOT,
  recoveryStatePath?: string,
  hooks: DesktopProfilePreparationHooks = {},
  blueprint: Blueprint = blueprintFromEnvironment(),
  /** The app instance's own top-level folder (contains `extensions/`) - distinct from `home` (the DSH home
   * inside it). Used to resolve an extension's own `dsh.requiresAcrylPackages` the same way Web's
   * `resolveWebEngineComposition` already does; omitted only by tests that do not exercise that path. */
  instanceHome?: string,
): PreparedDesktopProfile {
  const profileDir = profileName === DESKTOP_PROFILE_NAME
    ? ensureDesktopProfile(home)
    : resolveProfileDir(profileName, home)
  // DSH 0.2 removed the link backend; leftovers of 0.1.5-era launches are cleaned up synchronously (spec 001 R24).
  removeLinkProjections(profileDir)
  const moduleFallback = Promise.resolve()
  // `plugin-management` is the community market's user-facing scope. Startup
  // recovery has its own state file so switching to another provider cannot
  // reapply a stale community-market disable, while a recovery disable always
  // remains effective regardless of the selected provider. Keep the legacy
  // five-argument call compatible for tests/older embedders.
  const managedDisabledBundles = pluginStatePath === undefined
    ? new Set<string>()
    : readDesktopDisabledBundles(pluginStatePath, profileName)
  const recoveryDisabledBundles = recoveryStatePath === undefined
    ? (marketSelection.requested === DESKTOP_MARKET_IDENTITIES.community.provider
      ? new Set<string>()
      : new Set(managedDisabledBundles))
    : readDesktopDisabledBundles(recoveryStatePath, profileName)
  const disabledBundles = new Set(recoveryDisabledBundles)
  if (recoveryStatePath === undefined
    || marketSelection.requested === DESKTOP_MARKET_IDENTITIES.community.provider) {
    for (const packageName of managedDisabledBundles) disabledBundles.add(packageName)
  }
  const loadedProfile = loadRecoveryFilteredProfile(
    profileName,
    profileDir,
    disabledBundles,
    marketSelection.requested,
  )
  const profile = loadedProfile.profile
  const rootConfig = join(profileDir, DESKTOP_PROFILE_ROOT)
  const bareModuleBaseUrl = pathToFileURL(join(profile.dir, 'package.json')).href
  writeFileSync(rootConfig, '[]\n')

  const desktopPatches = loadOverlayPatches(BIN_NAME, DESKTOP_PATCH_PATH)
  const bundlePatches: PatchOptions[] = []
  const desktopOverlayPatches: PatchOptions[] = []
  const capabilities = new Set(blueprint.capabilities)
  let dshMarketPatches: PatchOptions[] | undefined
  let desktopLayerInserted = false
  const providerAwareDisabledBundles = new Set(disabledBundles)
  if (marketSelection.requested === DESKTOP_MARKET_IDENTITIES.dshMarket.provider) {
    providerAwareDisabledBundles.delete(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName)
  }
  for (const layer of activeDesktopProfileLayers(profile, providerAwareDisabledBundles)) {
    if (layer.packageName === DESKTOP_MARKET_IDENTITIES.dshMarket.packageName) {
      dshMarketPatches = layer.patches
      continue
    }
    bundlePatches.push(...layer.patches)
    if (layer.packageName !== '@deepseek-ai/dsh-web-app') continue
    desktopOverlayPatches.push(...desktopPatches)
    desktopLayerInserted = true
  }
  if (!desktopLayerInserted) {
    throw new Error(`${BIN_NAME}: desktop profile is missing @deepseek-ai/dsh-web-app`)
  }
  // Rows the bundles already compose (DSH 0.2's dsh-base now carries `authorization`) must not be inserted a second time.
  const sharedDesktopPatches = createAcrylCodingCapabilityPatches(
    new Set(['desktop']),
    new Set(composeEntries([bundlePatches]).flatMap(row => (typeof row.id === 'string' ? [row.id] : []))),
    capabilities,
  )

  const loadedHomePatches = loadOptionalPatches(BIN_NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
  const { patches: homePatches, skipped: skippedOptionalEntries } = omitUnresolvedOptionalEntries(
    loadedHomePatches,
    bareModuleBaseUrl,
  )
  const filteredBundles = filterMarketProviderPatches(bundlePatches)
  const filteredProfile = filterMarketProviderPatches(profile.patches)
  const filteredHome = filterMarketProviderPatches(homePatches)
  const hasProviderConflict = filteredBundles.removedProviderReference
    || filteredProfile.removedProviderReference
    || filteredHome.removedProviderReference
  let effectiveMarket: DesktopMarketProvider = 'disabled'
  let marketFailure: string | undefined
  const providerPatches: PatchOptions[] = []
  if (marketSelection.requested !== 'disabled') {
    if (hasProviderConflict) {
      marketFailure = `${BIN_NAME}: conflicting Market provider Loader identity was removed`
    } else if (marketSelection.requested === DESKTOP_MARKET_IDENTITIES.community.provider) {
      marketFailure = validateMarketPackage(
        DESKTOP_MARKET_IDENTITIES.community.packageName,
        bareModuleBaseUrl,
      )
      if (marketFailure === undefined) {
        providerPatches.push({
          insert: [{
            id: DESKTOP_MARKET_IDENTITIES.community.rowId,
            name: DESKTOP_MARKET_IDENTITIES.community.packageName,
          }],
        })
        effectiveMarket = DESKTOP_MARKET_IDENTITIES.community.provider
      }
    } else if (loadedProfile.dshMarketFailure !== undefined) {
      marketFailure = loadedProfile.dshMarketFailure
    } else if (dshMarketPatches === undefined) {
      marketFailure = `${BIN_NAME}: selected dshmarket bundle layer is unavailable`
    } else {
      try {
        validateDshMarketBundlePatches(dshMarketPatches)
        providerPatches.push(...dshMarketPatches)
        effectiveMarket = DESKTOP_MARKET_IDENTITIES.dshMarket.provider
      } catch (cause) {
        marketFailure = marketFailureMessage(cause)
      }
    }
  }
  const patches: PatchOptions[] = [
    ...filteredBundles.patches,
    ...sharedDesktopPatches,
    ...desktopOverlayPatches,
    ...providerPatches,
    ...filteredProfile.patches,
    ...filteredHome.patches,
  ]
  const composedRows = composeEntries([patches])
  assertUniqueEntryIds(composedRows)
  assertEffectiveMarketRows(composedRows, effectiveMarket)
  const rows = new Map<string, EntryOptions>()
  for (const row of composedRows) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  // Startup settings (shell mode, port, Blend) come from ACRYL's own preferences file, not from the harness settings
  // document: DSH 0.2 removed its file-backed settings provider (spec 001 R18, R24).
  const settingsDocument = join(instanceHome ?? dirname(home), ACRYL_SETTINGS_FILENAME)
  hooks.onSettingsDocumentResolved?.(settingsDocument)
  const { mode, port, blend: blendPath } = readDesktopStartupSettings(settingsDocument)
  // BLEND composition (D24): the selected owned Blend's lock becomes one
  // insert patch, pushed after the settings row and before the desktop
  // invariant pushes. Precedence: base composition < BLEND rows < desktop
  // invariants. Collisions against already-composed rows fail with a
  // blend-attributed error instead of the generic unique-id throw; a missing
  // or malformed lock fails the generation loudly (D23).
  let blend: DesktopBlendProjection | undefined
  if (blendPath !== null) {
    blend = readDesktopBlend(blendPath)
    assertNoBlendRowCollisions(blend, composedRows)
    patches.push(blendInsertPatch(blend))
  }
  // Brand swap: exactly one of the two same-slot-contract brand packages is
  // enabled, regardless of desktop mode (mirrors the compatibility-vs-advanced
  // toggle below, but this axis is brand identity, not shell composition).
  const officialBrandRow = rows.get(UI_BRAND_OFFICIAL_ROW_ID)
  if (officialBrandRow?.name !== '@deepseek-ai/dsh-client-ui-brand-official') {
    throw new Error(`${BIN_NAME}: desktop profile must use @deepseek-ai/dsh-client-ui-brand-official in the ${UI_BRAND_OFFICIAL_ROW_ID} row`)
  }
  // The selected Blueprint's ACRYL-owned rows (spec 036): brand, extension pack, prompt shaping, UI library, shortcuts and
  // mount anchors, in mount order. The packages resolve from this package's own dependency closure like the market package above.
  // Desktop's Market keeps its own provider switch, so the Blueprint never composes it here.
  patches.push(...composeBlueprintRows(blueprint, 'desktop').patches)
  // The app's own committed extensions may each need an ACRYL-owned framework package (same mechanism and
  // same reasoning as Web's `resolveWebEngineComposition` - a project grown via `acryl new` has no other way
  // to depend on an unpublished ACRYL-owned package; see that function's own doc comments for the full
  // design). A third-party extension claiming the advanced shell this way has no "compatibility vs advanced"
  // toggle of its own - unlike the IDE, there is no fallback content for it to show in compatibility mode -
  // so this disables the stock `ui-layout` row unconditionally, not only when `mode === 'advanced'`.
  const requiredFrameworkPackages = instanceHome === undefined
    ? []
    : extensionRequiredFrameworkPackages(join(instanceHome, 'extensions')).filter(name => rows.get(name) === undefined)
  for (const packageName of requiredFrameworkPackages) materializeProfilePackage(profileDir, packageName, pathToFileURL(INSTALL_ANCHOR).href)
  patches.push(...requiredFrameworkPackages.map(name => ({ insert: [{ id: name, name }] })))
  if (requiredFrameworkPackages.includes('acryl-app-shell') && mode !== 'advanced') {
    patches.push({ id: 'ui-layout', disabled: true }, { id: 'ui-sidebar', disabled: false }, { id: 'ui-conversation', disabled: false })
  }
  // ACRYL Workspace (spec 040): composed once for both Web and Desktop through the shared capability
  // declaration (`workspace` in `acryl-harness-runtime`'s coding-capabilities, part of
  // `sharedDesktopPatches`), not by a Desktop-only row here. Its client half takes over the frame only
  // when the shell mode is `advanced`.
  if (mode === 'advanced') {
    for (const [id, packageName] of [
      ['ui-layout', UI_LAYOUT_PACKAGE],
      ['ui-sidebar', UI_SIDEBAR_PACKAGE],
      ['ui-conversation', UI_CONVERSATION_PACKAGE],
    ] as const) {
      if (rows.get(id)?.name !== packageName) {
        throw new Error(`${BIN_NAME}: advanced desktop mode must use ${packageName} in the ${id} row`)
      }
    }
    // The rows toggled to hand the frame to the ACRYL shell are shared data, the same for Web.
    patches.push(...createAcrylShellCapabilityPatches(new Set(['desktop']), 'advanced', new Set(), capabilities))
  }
  // DSH 0.2 declares agent presets in profile YAML and the registry row only selects among them (spec 001 R24), so the
  // old shipped `roots` configuration is gone. The only Desktop rule left is the Windows guard that swaps in the registry
  // subclass hiding the preset that needs unsupported PTY inspection.
  const presets = rows.get(AGENT_PRESETS_ROW_ID)
  if (presets !== undefined
    && platform === 'win32'
    && presets.name === UPSTREAM_AGENT_PRESETS_PACKAGE
    && !rowDisabledOnPlatform(presets, platform)) {
    patches.push(
      {
        id: AGENT_PRESETS_ROW_ID,
        name: UPSTREAM_AGENT_PRESETS_PACKAGE,
        disabled: true,
      },
      {
        insert: [{
          id: DESKTOP_WINDOWS_AGENT_PRESETS_ROW_ID,
          name: DESKTOP_WINDOWS_AGENT_PRESETS_PACKAGE,
          config: rowConfig(presets),
        }],
      },
    )
  }
  const webserver = rows.get('webserver')
  if (webserver === undefined) {
    throw new Error(`${BIN_NAME}: desktop profile has no webserver row`)
  }
  if (platform === 'win32') {
    if (!rows.has(DIRECTORY_PICKER_ROW_ID)) {
      throw new Error(`${BIN_NAME}: desktop profile has no directory-picker row`)
    }
    patches.push(
      {
        id: DIRECTORY_PICKER_ROW_ID,
        name: AUTO_PICKER_PACKAGE,
        disabled: true,
      },
      {
        insert: [
          {
            id: 'desktop-directory-picker-browse-host',
            name: BROWSE_PICKER_BACKEND,
          },
          {
            id: 'desktop-directory-picker-browse-surface',
            name: BROWSE_PICKER_SURFACE,
          },
        ],
      },
    )
    const pwshSandbox = rows.get(PWSH_SANDBOX_ROW_ID)
    if (WINDOWS_PWSH_SANDBOX_REATTACHED && pwshSandbox?.name === UPSTREAM_PWSH_SANDBOX_PACKAGE
      && !rowDisabledOnPlatform(pwshSandbox, platform)) {
      patches.push(
        {
          id: PWSH_SANDBOX_ROW_ID,
          name: UPSTREAM_PWSH_SANDBOX_PACKAGE,
          disabled: true,
        },
        {
          insert: [
            {
              id: DESKTOP_WINDOWS_PWSH_SANDBOX_ROW_ID,
              name: DESKTOP_WINDOWS_PWSH_SANDBOX_PACKAGE,
              ...(pwshSandbox.disabled === undefined ? {} : { disabled: pwshSandbox.disabled }),
              config: rowConfig(pwshSandbox),
            },
          ],
        },
      )
    }
  }
  // Loader patches cannot change an existing row's package identity. Disable the
  // profile row by its current identity and insert the Desktop-owned provider.
  // Loopback-only binding is a launcher security invariant, not user config.
  const webserverConfig = { host: '127.0.0.1', port }
  if (webserver.name === DESKTOP_WEB_SERVER_PACKAGE) {
    patches.push({
      id: 'webserver',
      name: DESKTOP_WEB_SERVER_PACKAGE,
      disabled: false,
      config: webserverConfig,
    })
  } else {
    if (typeof webserver.name !== 'string') {
      throw new Error(`${BIN_NAME}: desktop profile webserver row has no package identity`)
    }
    const replacement = rows.get(DESKTOP_WEB_SERVER_ROW_ID)
    if (replacement !== undefined && replacement.name !== DESKTOP_WEB_SERVER_PACKAGE) {
      throw new Error(`${BIN_NAME}: reserved ${DESKTOP_WEB_SERVER_ROW_ID} row has a conflicting package identity`)
    }
    patches.push({
      id: 'webserver',
      name: webserver.name,
      disabled: true,
    })
    if (replacement === undefined) {
      patches.push({
        insert: [{
          id: DESKTOP_WEB_SERVER_ROW_ID,
          name: DESKTOP_WEB_SERVER_PACKAGE,
          config: webserverConfig,
        }],
      })
    } else {
      patches.push({
        id: DESKTOP_WEB_SERVER_ROW_ID,
        name: DESKTOP_WEB_SERVER_PACKAGE,
        disabled: false,
        config: webserverConfig,
      })
    }
  }
  // `@deepseek-ai/dsh-client-connection` mounts every per-caller RPC channel
  // through the Context it was constructed with and resolves `webServer` while
  // registering each route (`HostConnectionService.register`). Cordis resolves
  // an undeclared name only along the provider's fiber chain, so a caller's
  // `connection.rpc.handle(channel, handler)` throws `cannot get property
  // "webServer" without inject` whenever the webServer row is a sibling of the
  // connection row - which every bundle composition is, because an insert
  // without a target appends siblings. Declaring the dependency on the row
  // itself makes the service resolvable from that Context, which restores the
  // documented channel API for third-party plugins instead of forcing them onto
  // private registration entry points.
  const connection = rows.get(CONNECTION_ROW_ID)
  if (connection !== undefined && connection.name === UPSTREAM_CONNECTION_PACKAGE) {
    patches.push({
      id: CONNECTION_ROW_ID,
      name: UPSTREAM_CONNECTION_PACKAGE,
      inject: withDeclaredDependency(connection.inject, 'webServer'),
    })
  }
  if ((telemetryDisabled ?? '') !== '' && rows.has('session-telemetry-otel')) {
    patches.push({ id: 'session-telemetry-otel', disabled: true })
  }
  const desktopShell = rows.get('desktop-shell')
  if (desktopShell === undefined) {
    throw new Error(`${BIN_NAME}: desktop profile has no desktop-shell row`)
  }
  patches.push({
    id: 'desktop-shell',
    disabled: false,
    config: {
      ...rowConfig(desktopShell),
      mode,
      port,
    },
  })
  if (hooks.pluginLifecycleStatePath !== undefined) {
    patches.push(...pluginLifecyclePatches({
      profileName: profile.name,
      statePath: hooks.pluginLifecycleStatePath,
    }))
  }
  return {
    homeDir: home,
    profile,
    rootConfig,
    bareModuleBaseUrl,
    patches: structuredClone(patches),
    skippedOptionalEntries,
    mode,
    port,
    settingsDocument,
    market: desktopMarketSnapshotWithEffective(marketSelection, effectiveMarket),
    ...(marketFailure === undefined ? {} : { marketFailure }),
    ...(blend === undefined ? {} : { blend }),
    moduleFallback,
  }
}

/** Expose the package anchor for focused resolution tests. */
export function desktopInstallAnchor(): string {
  return INSTALL_ANCHOR
}

/** Preserve the public manifest type in the declaration graph used by plugin tooling. */
export type DesktopProfileManifest = ProfileManifest
