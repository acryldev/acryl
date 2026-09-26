import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
// The advanced shell's slot declarations and `ctx.layout` now live in the shared workspace package.
import type {} from 'acryl-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only service and SlotMap convergence for the Desktop settings section.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: `ctx.slots`'s `Context` augmentation (split out of
// `dsh-client-ui-slots`'s pure core into `dsh-client-ui-renderer` in the
// v0.1.5-alpha.1 "extract Store and renderer Slot infrastructure" refactor)
// and `GlobalStandardProps.useSessions`/`ctx.uiWorkspace`, respectively.
// `ui-sidebar`/`ui-conversation` are pulled in too: `ui-workspace`'s own
// `.d.ts` references their `'sidebar.workspaces'`/`'conversation.hero.workspace'`
// SlotMap keys, which only exist in the program once those declarations merge in.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { startRendererBootReporter } from './boot-health.ts'
import { applyDesktopSettings } from './settings/desktop-settings.ts'
import { installDesktopDirectoryPickerBridge, requestDesktopDirectoryValidation } from './workspaces/directory-picker.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { installWorkspaceFolderDrop } from './workspaces/workspace-folder-drop.ts'

export { applyDesktopSettings } from './settings/desktop-settings.ts'
export {
  createDesktopSettingsApi,
  desktopSettingsPaths,
  parseDesktopActionAcceptance,
  parseDesktopRestartAcceptance,
  parseDesktopSettingsView,
} from './settings/desktop-settings-api.ts'
export type {
  DesktopMarketProvider,
  DesktopMarketView,
  DesktopProfileView,
  DesktopRestartAcceptance,
  DesktopSettingsApi,
  DesktopSettingsView,
} from './settings/desktop-settings-api.ts'
export { DesktopSettingsSection } from './settings/DesktopSettingsSection.tsx'
export { DesktopTerminalSettingsAction } from './settings/DesktopTerminalSettingsAction.tsx'
export type {
  DesktopTerminalSettingsActionInjected,
  DesktopTerminalSettingsActionProps,
} from './settings/DesktopTerminalSettingsAction.tsx'
export type {
  DesktopNotificationSettings,
  DesktopSettingsSectionInjected,
  DesktopSettingsSectionProps,
  DesktopShellSettings,
} from './settings/DesktopSettingsSection.tsx'
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
  'uiWorkspace',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.hash)
  if (!environment) return
  // ACRYL identity is composed at the Loader level (`dsh-client-ui-brand-acryl`,
  // a standalone swappable counterpart to `@deepseek-ai/dsh-client-ui-brand-official`
  // - see profile.ts), not applied inline from this plugin.
  applyDesktopSettings(ctx, environment)
  ctx.effect(
    () => startRendererBootReporter(ctx.loader),
    'acryl-desktop: renderer boot health report',
  )
  ctx.effect(
    () => installWorkspaceFolderDrop({
      create: input => ctx.workspaces.create(input),
      startSession: workspaceId => { ctx.uiWorkspace.startSession(workspaceId) },
      ...(environment.platform === 'win32'
        ? { validateDirectory: (path: string) => requestDesktopDirectoryValidation(path) }
        : {}),
    }),
    'acryl-desktop: workspace folder drop',
  )
  if (environment.platform === 'win32') {
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'acryl-desktop: native directory picker bridge',
    )
  }
  // The advanced shell itself (frame, layout service, slots) is the shared `acryl-workspace` client
  // plugin, so Web and Desktop render the identical shell; Desktop supplies only its native parts above.
}
