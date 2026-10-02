import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
// The advanced shell's slot declarations and `ctx.layout` now live in the shared workspace package.
// DETACHED (spec 001 R25): `acryl-workspace/client` types are not imported while the workspace plugin is detached; its
// advanced-shell contracts redeclare `ctx.layout`, which DSH 0.2's own layout service now owns.
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
import { installDesktopDirectoryPickerBridge, requestDesktopDirectoryValidation } from './workspaces/directory-picker.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { installWorkspaceFolderDrop } from './workspaces/workspace-folder-drop.ts'

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
// DETACHED (see the note in `apply`): the settings section, terminal action and their prop types are not exported until re-attached.
export {
  RENDERER_BOOT_REPORT_PATH,
  rendererBootReport,
  sendRendererBootReport,
  startRendererBootReporter,
} from './boot-health.ts'
export type { RendererBootLoader, RendererBootReport } from './boot-health.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by Desktop presentation. `settingsScope` is gone in DSH 0.2 (see the DETACHED note in `apply`). */
export const inject = [
  'slots',
  'locale',
  'connection',
  'remote',
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
  // DETACHED on the DSH 0.2 branch (spec 001 R25): the Desktop settings page bound the removed client `settingsScope`
  // (`ctx.settingsScope.bind`). Re-attach it over the ACRYL preferences route (`acryl-settings`, host side already
  // migrated) in the 0.2 `settings.section` slot, then restore the call and the export of `applyDesktopSettings`.
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
  // dialog.showOpenDialog is the same native Electron call on every platform - the Host's own
  // canPickDirectory strategy flag (electron-platform.ts) is what actually gates this per OS.
  if (environment.platform === 'win32' || environment.platform === 'darwin') {
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'acryl-desktop: native directory picker bridge',
    )
  }
  // The advanced shell itself (frame, layout service, slots) is the shared `acryl-workspace` client
  // plugin, so Web and Desktop render the identical shell; Desktop supplies only its native parts above.
}
