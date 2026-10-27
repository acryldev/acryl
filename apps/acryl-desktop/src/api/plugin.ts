/**
 * Desktop's own private routes (the settings and preferences API, the renderer boot report, the native directory picker and validator),
 * served through the framework's router. Its own plugin, so the router is a hard requirement it can wait for (PENDING without one) and a
 * router reload re-registers only these routes: the shell plugin, which owns the window, never unloads with them (spec 048 T003).
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import type {} from 'acryl-settings'
import type {} from '../settings/desktop-settings-controller.ts'
import type {} from '../shell/runtime.ts'
import { desktopPreferencesRoutes } from '../settings/desktop-preferences-route.ts'
import { desktopSettingsRoutes } from '../settings/desktop-settings-route.ts'
import { rendererBootRoutes } from '../startup/renderer-boot.ts'
import { directoryPickerRoutes } from '../workspaces/directory-picker-route.ts'
import { DESKTOP_API_PREFIXES, desktopApi } from './http.ts'

/** Stable Cordis plugin name, equal to the module and the Loader row id. */
export const name = 'acryl-desktop/api'

/** The router and its Web adapter serve the routes; the native runtime and ACRYL's settings answer them. */
export const inject = ['router', 'routerHttp', 'desktopRuntime', 'acrylSettings']

export function apply(ctx: Context): void {
  const runtime = ctx.desktopRuntime
  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // The launcher provides the settings controller; a plain DSH boot of this profile has none, and then has no settings routes.
  const settings = ctx.get('desktopSettingsController')
  const app = desktopApi(
    ...(settings === undefined ? [] : [desktopSettingsRoutes(settings, reportError)]),
    desktopPreferencesRoutes(ctx.acrylSettings, reportError),
    rendererBootRoutes((report) => { runtime.reportRendererBoot(report) }),
    // The native chooser exists wherever `pickDirectory` can say yes, which today is win32 and darwin (T134).
    ...(runtime.platform === 'win32' || runtime.platform === 'darwin'
      ? [directoryPickerRoutes(runtime, reportError)]
      : []),
  )
  ctx.router.route('/', app)
  for (const prefix of DESKTOP_API_PREFIXES) ctx.routerHttp.mount(prefix)
}
