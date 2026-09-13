/**
 * CLI/TUI's own `desktopPlugins` + `livePluginActivation` capabilities (spec
 * 034, completing T006 for the third surface) - the package-name-shaped view
 * `dsh-community-market`'s install service needs, plus real live activation
 * so an install through the TUI's own `/plugins` command takes effect
 * without restarting the process.
 *
 * Adapted directly from `web-market-plugins.ts` - not a new lifecycle
 * implementation. It wraps the same shared `AcrPluginLifecycleController`
 * (spec 034 T005) the CLI's own `acryl plugin enable/disable` and Desktop's
 * Lifecycle tab already drive.
 */

import { randomUUID } from 'node:crypto'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { AcrPluginLifecycleController } from 'acryl-control'
import {
  mountAcrylPluginLifecycle,
  type DshPluginLifecycleOptions,
} from './plugin-lifecycle.ts'

export interface CliMarketPluginBundle {
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

// No `declare module '@deepseek-ai/cordis'` augmentation here - same reason
// as web-market-plugins.ts.

const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 256
/** Matches dsh-community-market's own PACKAGE_NAME_PATTERN. */
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u

/** Matches `dsh-community-market`'s own `MarketDesktopPlugins` shape exactly. */
export class CliPluginsService extends Service {
  private readonly previews = new Map<string, PreviewEntry>()

  private readonly controller: AcrPluginLifecycleController
  private readonly profileName: string

  constructor(ctx: Context, options: { readonly controller: AcrPluginLifecycleController; readonly profileName: string }) {
    super(ctx, 'desktopPlugins')
    this.controller = options.controller
    this.profileName = options.profileName
  }

  list(): readonly CliMarketPluginBundle[] {
    return this.controller.snapshot().entries
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
    if (entry === undefined) throw new Error(`cli plugins: no such bundle ${JSON.stringify(bundleId)}`)
    if (!entry.mutable) throw new Error(`cli plugins: bundle ${JSON.stringify(bundleId)} is not user-mutable`)
    const expectedCurrent = !targetEnabled
    if (entry.enabled !== expectedCurrent) {
      throw new Error(`cli plugins: bundle ${JSON.stringify(bundleId)} is already ${entry.enabled ? 'enabled' : 'disabled'}`)
    }
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
      throw new Error('cli plugins: preview not found or expired')
    }
    this.previews.delete(previewId)
    if (Date.now() > preview.expiresAt) throw new Error('cli plugins: preview expired')
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
 * Live activation for a CLI/TUI process - the same shared
 * `AcrPluginLifecycleController` Web and Desktop already drive, mounting a
 * just-installed package into the live Loader tree without a process
 * restart. The TUI's own `/plugins` command calls this directly after a
 * successful install and then refreshes its own dynamic slash-command list
 * (spec 034 T009) - there is no separate renderer process to reload here,
 * unlike Web's `location.reload()` or Desktop's Client webContents reload.
 */
export class CliLiveActivationService extends Service {
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
 * Mount the shared plugin lifecycle for this CLI process and provide the
 * market-shaped view over it, plus live activation.
 * @param ctx - the host root.
 * @param options - the same options shape the CLI's own `plugin-command.ts` already builds.
 */
export function provideCliMarketPlugins(ctx: Context, options: DshPluginLifecycleOptions): AcrPluginLifecycleController {
  const lifecycle = mountAcrylPluginLifecycle(ctx, options)
  ctx.plugin(CliPluginsService, { controller: lifecycle.controller, profileName: options.profileName })
  ctx.plugin(CliLiveActivationService, lifecycle.controller)
  return lifecycle.controller
}
