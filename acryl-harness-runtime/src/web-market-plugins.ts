/**
 * Web's own `desktopPlugins` capability (spec 034 T006, scoped v1) - the
 * package-name/preview-token-shaped adapter `dsh-community-market`'s install
 * service needs for `disabledPackageNames()` (a hard requirement even for a
 * plain install - `previewInstall` checks a target isn't already disabled),
 * plus real enable/disable for its Installed tab.
 *
 * Not a new lifecycle implementation: wraps the SAME shared
 * `AcrPluginLifecycleController` (spec 034 T005) the CLI's own `acryl
 * plugin enable/disable` and Desktop's Lifecycle tab already drive - this
 * file is only the market-shaped view over it, matching how
 * `acryl-desktop/src/desktop-plugins.ts` is Desktop's own view over the
 * identical shared controller.
 *
 * `bundleId` here is simply the Loader `entryId` - Web owns both sides of
 * this contract, so there is no need for a second opaque identifier layer
 * the way Desktop's own richer bundle-tracking might want one.
 */

import { randomUUID } from 'node:crypto'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { AcrPluginLifecycleController } from 'acryl-control'
import {
  mountAcrylPluginLifecycle,
  type DshPluginLifecycleOptions,
} from './plugin-lifecycle.ts'

export interface WebMarketPluginBundle {
  readonly bundleId: string
  readonly packageName: string
  readonly status: 'active' | 'disabled'
  readonly mutable: boolean
}

interface PreviewEntry {
  readonly entryId: string
  readonly packageName: string
  readonly targetEnabled: boolean
  readonly expiresAt: number
}

// No `declare module '@deepseek-ai/cordis'` augmentation here - see the
// identical note in web-market-install.ts. acryl-desktop's own
// desktop-plugins.ts already declares `desktopPlugins` on Context with its
// own type; a second, differently-shaped declaration for the same name is a
// hard TypeScript merge conflict across packages, not something either side
// can quietly win. `Service`'s constructor takes a plain `name: string`, so
// providing under this exact name needs no static declaration at all.

const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 256
/** Matches dsh-community-market's own PACKAGE_NAME_PATTERN - it rejects the whole list if even one entry isn't a real npm package name. */
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u

/** Matches `dsh-community-market`'s own `MarketDesktopPlugins` shape exactly - the six methods it actually calls. */
export class WebPluginsService extends Service {
  private readonly previews = new Map<string, PreviewEntry>()

  private readonly controller: AcrPluginLifecycleController
  private readonly profileName: string

  constructor(ctx: Context, options: { readonly controller: AcrPluginLifecycleController; readonly profileName: string }) {
    super(ctx, 'desktopPlugins')
    this.controller = options.controller
    this.profileName = options.profileName
  }

  list(): readonly WebMarketPluginBundle[] {
    return this.controller.snapshot().entries
      // A Loader row's own `moduleName` is often not npm-package-shaped at
      // all (`cordis:group`, `cordis:include`, ...) - the market validates
      // every name it receives against exactly this npm-package pattern
      // (`dsh-community-market`'s own PACKAGE_NAME_PATTERN) and hard-rejects
      // the whole list if even one entry fails, so this filter isn't
      // optional cosmetics.
      .filter(entry => NPM_PACKAGE_NAME_PATTERN.test(entry.moduleName))
      .map(entry => ({
        bundleId: entry.entryId,
        packageName: entry.moduleName,
        status: entry.enabled ? 'active' : 'disabled',
        mutable: entry.mutable,
      }))
  }

  disabledPackageNames(): readonly string[] {
    return this.controller.snapshot().entries
      .filter(entry => !entry.enabled && NPM_PACKAGE_NAME_PATTERN.test(entry.moduleName))
      .map(entry => entry.moduleName)
  }

  isDisabled(packageName: string): boolean {
    return this.disabledPackageNames().includes(packageName)
  }

  private mintPreview(bundleId: string, targetEnabled: boolean): { readonly previewId: string; readonly profileName: string; readonly packageName: string; readonly expiresAt: string } {
    const entry = this.controller.snapshot().entries.find(candidate => candidate.entryId === bundleId)
    if (entry === undefined) throw new Error(`web plugins: no such bundle ${JSON.stringify(bundleId)}`)
    if (!entry.mutable) throw new Error(`web plugins: bundle ${JSON.stringify(bundleId)} is not user-mutable`)
    const expectedCurrent = !targetEnabled
    if (entry.enabled !== expectedCurrent) {
      throw new Error(`web plugins: bundle ${JSON.stringify(bundleId)} is already ${entry.enabled ? 'enabled' : 'disabled'}`)
    }
    // Bounded like Desktop's own preview cache - a preview is a short-lived
    // confirmation token, not persisted state; dropping the oldest on
    // overflow is an acceptable, simple eviction for a purely defensive cap.
    if (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value
      if (oldest !== undefined) this.previews.delete(oldest)
    }
    const previewId = randomUUID()
    const expiresAt = Date.now() + PREVIEW_TTL_MS
    this.previews.set(previewId, { entryId: bundleId, packageName: entry.moduleName, targetEnabled, expiresAt })
    return { previewId, profileName: this.profileName, packageName: entry.moduleName, expiresAt: new Date(expiresAt).toISOString() }
  }

  previewDisable(bundleId: string) {
    return this.mintPreview(bundleId, false)
  }

  previewEnable(bundleId: string) {
    return this.mintPreview(bundleId, true)
  }

  private async execute(previewId: string, targetEnabled: boolean): Promise<{ readonly packageName: string }> {
    const preview = this.previews.get(previewId)
    if (preview === undefined || preview.targetEnabled !== targetEnabled) {
      throw new Error('web plugins: preview not found or expired')
    }
    this.previews.delete(previewId)
    if (Date.now() > preview.expiresAt) throw new Error('web plugins: preview expired')
    await this.controller.setEnabled(preview.entryId, targetEnabled)
    return { packageName: preview.packageName }
  }

  executeDisable(previewId: string): Promise<{ readonly packageName: string }> {
    return this.execute(previewId, false)
  }

  executeEnable(previewId: string): Promise<{ readonly packageName: string }> {
    return this.execute(previewId, true)
  }
}

/**
 * Web's own `livePluginActivation` (spec 034 T006 follow-up, prompted by a
 * real user hitting the gap: installing through the Market left the new
 * plugin inactive until a full server-process restart). Matches Desktop's
 * own `LivePluginActivationService` (`acryl-desktop/src/plugin-lifecycle-
 * controller.ts`) almost line for line - both are thin wrappers over the
 * exact same shared `AcrPluginLifecycleController` (spec 034 T005), whose
 * `activate()`/`deactivate()`/`setEnabledByPackageName()`/`statusOfPackage()`
 * are already fully generic: `activate()` resolves the just-installed
 * package's own Loader row through `PluginLifecycleHost.bundleRow()` (backed
 * here by the same `resolvePackageJson` this file's own `provideWebMarketPlugins`
 * already wires up) and mounts it into the *live* Loader tree via
 * `ctx.loader.create()` - the same proven, still-shipped host-side hot-mount
 * mechanism `specs/032-universal-hot-reload`'s T1/T2/T4/T5 already landed and
 * use elsewhere. Nothing new or risky is built here; this is reuse.
 *
 * `dsh-community-market`'s own install service calls `activate()`
 * automatically right after a successful install when this service is
 * present (`liveActivate` in `dsh-community-market/src/index.ts`), then
 * `acknowledgeLiveInstall()` (already implemented as a no-op above - no WAL
 * to acknowledge). The market's own client finishes with a full page
 * `location.reload()` - the same safe mechanism Desktop's Client half uses
 * (a renderer/webContent reload, not a process restart); Web's `location` IS
 * the browser tab, so this is the exact same operation for both surfaces,
 * not something this file needs to build separately.
 */
export class WebLiveActivationService extends Service {
  constructor(ctx: Context, private readonly controller: AcrPluginLifecycleController) {
    super(ctx, 'livePluginActivation')
  }

  async activate(packageName: string): Promise<void> {
    await this.controller.activate(packageName)
  }

  async deactivate(packageName: string): Promise<void> {
    await this.controller.deactivate(packageName)
  }

  setEnabled(packageName: string, enabled: boolean): Promise<boolean> {
    return this.controller.setEnabledByPackageName(packageName, enabled)
  }

  statusOf(packageName: string): 'active' | 'disabled' | undefined {
    return this.controller.statusOfPackage(packageName)
  }
}

/**
 * Mount the shared plugin lifecycle for Web (not yet done anywhere in this
 * surface before this file) and provide the market-shaped view over it,
 * plus live activation so a Market install/uninstall takes effect without a
 * server-process restart.
 * @param ctx - the host root (matching `provideWebMarketInstall`'s own timing/scope).
 * @param options - the same options shape the CLI's own `plugin-command.ts` already builds.
 */
export function provideWebMarketPlugins(ctx: Context, options: DshPluginLifecycleOptions): void {
  const lifecycle = mountAcrylPluginLifecycle(ctx, options)
  ctx.plugin(WebPluginsService, { controller: lifecycle.controller, profileName: options.profileName })
  ctx.plugin(WebLiveActivationService, lifecycle.controller)
}
