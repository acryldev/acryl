import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only service and SlotMap convergence for the Desktop settings section.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { applyAcrBrand } from './acr-brand.tsx'
import { applyAdvancedShell } from './advanced-shell.ts'
import { startRendererBootReporter } from './boot-health.ts'
import { applyDesktopSettings } from './desktop-settings.ts'
import { installDesktopDirectoryPickerBridge, requestDesktopDirectoryValidation } from './directory-picker.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { applyPluginLifecycleSettings } from './plugin-lifecycle-settings.ts'
import { installWorkspaceFolderDrop } from './workspace-folder-drop.ts'

export { AcrBrandMark, AcrBrandName, applyAcrBrand } from './acr-brand.tsx'
export type { AcrBrandMarkProps, AcrBrandNameProps } from './acr-brand.tsx'
export { applyAdvancedShell } from './advanced-shell.ts'
export { applyDesktopSettings } from './desktop-settings.ts'
export { PluginArchitectureSettingsTab } from './PluginArchitectureSettingsTab.tsx'
export type {
  PluginArchitectureSettingsTabInjected,
  PluginArchitectureSettingsTabProps,
} from './PluginArchitectureSettingsTab.tsx'
export { PluginLifecycleSettingsTab } from './PluginLifecycleSettingsTab.tsx'
export type {
  PluginLifecycleSettingsTabInjected,
  PluginLifecycleSettingsTabProps,
} from './PluginLifecycleSettingsTab.tsx'
export {
  createPluginArchitectureApi,
  parseCordisPlaneSnapshot,
} from './plugin-architecture-api.ts'
export type { PluginArchitectureApi } from './plugin-architecture-api.ts'
export {
  createPluginLifecycleApi,
  parsePluginLifecycleSnapshot,
} from './plugin-lifecycle-api.ts'
export type {
  PluginLifecycleApi,
  PluginLifecycleClientEntryView,
  PluginLifecycleClientSnapshot,
} from './plugin-lifecycle-api.ts'
export { applyPluginLifecycleSettings } from './plugin-lifecycle-settings.ts'
export {
  createDesktopSettingsApi,
  desktopSettingsPaths,
  parseDesktopActionAcceptance,
  parseDesktopRestartAcceptance,
  parseDesktopSettingsView,
} from './desktop-settings-api.ts'
export type {
  DesktopMarketProvider,
  DesktopMarketView,
  DesktopProfileView,
  DesktopRestartAcceptance,
  DesktopSettingsApi,
  DesktopSettingsView,
} from './desktop-settings-api.ts'
export { DesktopSettingsSection } from './DesktopSettingsSection.tsx'
export { DesktopTerminalSettingsAction } from './DesktopTerminalSettingsAction.tsx'
export type {
  DesktopTerminalSettingsActionInjected,
  DesktopTerminalSettingsActionProps,
} from './DesktopTerminalSettingsAction.tsx'
export type {
  DesktopNotificationSettings,
  DesktopSettingsSectionInjected,
  DesktopSettingsSectionProps,
  DesktopShellSettings,
} from './DesktopSettingsSection.tsx'
export {
  RENDERER_BOOT_REPORT_PATH,
  rendererBootReport,
  sendRendererBootReport,
  startRendererBootReporter,
} from './boot-health.ts'
export type { RendererBootLoader, RendererBootReport } from './boot-health.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by Desktop settings and advanced presentation. */
export const inject = [
  'slots',
  'locale',
  'connection',
  'remote',
  'settingsScope',
  'sessions',
  'theme',
  'workspaces',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (!environment) return
  applyAcrBrand(ctx)
  applyDesktopSettings(ctx, environment)
  applyPluginLifecycleSettings(ctx)
  ctx.effect(
    () => startRendererBootReporter(ctx.loader),
    'dsh-plugin-desktop: renderer boot health report',
  )
  ctx.effect(
    () => installWorkspaceFolderDrop({
      create: input => ctx.workspaces.create(input),
      startSession: workspaceId => { ctx.workspaces.startSession(workspaceId) },
      ...(environment.platform === 'win32'
        ? { validateDirectory: (path: string) => requestDesktopDirectoryValidation(path) }
        : {}),
    }),
    'dsh-plugin-desktop: workspace folder drop',
  )
  if (environment.platform === 'win32') {
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'dsh-plugin-desktop: native directory picker bridge',
    )
  }
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
