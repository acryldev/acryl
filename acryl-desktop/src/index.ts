/** ACRYL Host plugin: owns the selected native shell generation. */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-commands'
// `ctx.connection`'s Context augmentation; see the authenticatedUrl() call
// building the renderer URL below.
import type {} from '@deepseek-ai/dsh-client-connection'
import {
  LOCALE_IDS,
  LOCALE_SETTINGS_NAMESPACE,
  type LocaleSettings,
} from '@deepseek-ai/dsh-client-locale'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  THEME_SETTINGS_NAMESPACE,
  type ThemeSettings,
} from '@deepseek-ai/dsh-client-ui-theme'
import {
  handleRendererBootRequest,
  RENDERER_BOOT_REPORT_PATH,
} from './renderer-boot.ts'
import {
  DESKTOP_DIRECTORY_PICKER_PATH,
  DESKTOP_DIRECTORY_VALIDATOR_PATH,
} from './directory-picker-contract.ts'
import {
  handleDesktopDirectoryPickerRequest,
  handleDesktopDirectoryValidationRequest,
} from './directory-picker-route.ts'
import {
  DESKTOP_DIAGNOSTICS_EXPORT_PATH,
  DESKTOP_MARKET_SELECT_PATH,
  DESKTOP_PROFILE_CREATE_PATH,
  DESKTOP_PROFILE_CREATE_WINDOW_PATH,
  DESKTOP_PROFILE_DELETE_PATH,
  DESKTOP_PROFILE_ROLLBACK_PATH,
  DESKTOP_PROFILE_SELECT_PATH,
  DESKTOP_SETTINGS_PATH,
  DESKTOP_TERMINAL_OPEN_PATH,
} from './desktop-settings-contract.ts'
import {
  handleDesktopDiagnosticsExportRequest,
  handleDesktopMarketSelectRequest,
  handleDesktopProfileCreateRequest,
  handleDesktopProfileCreateWindowRequest,
  handleDesktopProfileDeleteRequest,
  handleDesktopProfileRollbackRequest,
  handleDesktopProfileSelectRequest,
  handleDesktopSettingsRequest,
  handleDesktopTerminalOpenRequest,
} from './desktop-settings-route.ts'
import type {} from './desktop-settings-controller.ts'
import { PLUGIN_ARCHITECTURE_PATH } from './plugin-architecture-contract.ts'
import { inspectCordisContext } from './plugin-architecture-inspector.ts'
import { handlePluginArchitectureSnapshotRequest } from './plugin-architecture-route.ts'
import {
  PLUGIN_LIFECYCLE_DISABLE_PATH,
  PLUGIN_LIFECYCLE_ENABLE_PATH,
  PLUGIN_LIFECYCLE_PATH,
  PLUGIN_LIFECYCLE_RELOAD_PATH,
} from './plugin-lifecycle-contract.ts'
import { PluginLifecycleController } from './plugin-lifecycle-controller.ts'
import {
  handlePluginLifecycleDisableRequest,
  handlePluginLifecycleEnableRequest,
  handlePluginLifecycleReloadRequest,
  handlePluginLifecycleSnapshotRequest,
} from './plugin-lifecycle-route.ts'
import type {} from './plugin-lifecycle-state.ts'
import { desktopBootRecoveryInjections } from './desktop-boot-recovery.ts'
import type { DesktopLocale, DesktopShellMode } from './runtime.ts'
import type {} from './runtime.ts'

/**
 * Narrow `dsh-client-locale`'s open, plugin-extensible `LocaleId` down to the
 * fixed set the native shell chrome (window title, tray, menu) actually ships
 * strings for. A language-pack-only preference falls back to the platform
 * default rather than mislabeling the native chrome in a locale it has no
 * strings for.
 */
function toDesktopLocale(preference: string | undefined): DesktopLocale | undefined {
  return LOCALE_IDS.includes(preference as (typeof LOCALE_IDS)[number]) ? (preference as DesktopLocale) : undefined
}
import { DESKTOP_DEFAULT_WEB_PORT } from './desktop-port.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-shell'

/** Services required before the shell can register its renderer generation. */
/** Services required by the desktop shell; `desktopRuntime` is probed, not required. */
export const inject = ['webServer', 'webRuntime', 'appExit', 'settings', 'loader']

// `SettingsNamespace` is a compile-time-validated string literal type, not a
// branded runtime value — `ctx.settings.register`/`.get`/etc. accept these
// literals directly (see `@deepseek-ai/dsh-settings`'s `SettingsNamespaceInput`).
/** Standard settings namespace shared by tray and configuration surfaces. */
export const DESKTOP_SETTINGS_NAMESPACE = 'dsh-desktop'

const UI_THEME_SETTINGS_NAMESPACE = THEME_SETTINGS_NAMESPACE
const UI_LOCALE_SETTINGS_NAMESPACE = LOCALE_SETTINGS_NAMESPACE

/** Desktop settings presented by the standard settings service. */
export interface DesktopSettings {
  /** Native presentation selected for the next application generation. */
  mode: DesktopShellMode
  /** Loopback Web port selected for the next application generation; zero requests a random port. */
  port: number
  /** Log verbosity threshold applied to the file logger. */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/** Schema registered with the standard settings service. */
export const DesktopSettingsSchema: z<DesktopSettings> = z.object({
  mode: z.union(['compatibility', 'advanced'] as const).default('advanced'),
  port: z.number().step(1).min(0).max(65_535).default(DESKTOP_DEFAULT_WEB_PORT),
  logLevel: z.union(['debug', 'info', 'warn', 'error'] as const).default('info'),
})

/** Native window configuration. */
export interface Config {
  /** Native presentation mode selected before BrowserWindow construction. */
  mode: DesktopShellMode
  /** Configured loopback Web port used to detect restart-applied settings changes. */
  port: number
  /** Initial window width in CSS pixels. */
  width: number
  /** Initial window height in CSS pixels. */
  height: number
  /** Minimum window width in CSS pixels. */
  minWidth: number
  /** Minimum window height in CSS pixels. */
  minHeight: number
}

/** Validated native window configuration. */
export const Config: z<Config> = z.object({
  mode: z.union(['compatibility', 'advanced'] as const).default('advanced'),
  port: z.number().step(1).min(0).max(65_535).default(DESKTOP_DEFAULT_WEB_PORT),
  width: z.number().step(1).min(800).default(1280),
  height: z.number().step(1).min(600).default(840),
  minWidth: z.number().step(1).min(640).default(900),
  minHeight: z.number().step(1).min(480).default(640),
})

/**
 * Construct the unmodified upstream Web root URL.
 * @param port - active loopback Web server port.
 * @param mode - active native presentation mode.
 * @param platform - active Electron platform.
 * @returns the URL loaded by the BrowserWindow.
 */
export function desktopRendererUrl(
  port: number,
  mode: DesktopShellMode,
  platform: Context['desktopRuntime']['platform'],
  authenticate: (baseUrl: string) => string = baseUrl => baseUrl,
): string {
  // Connection's `authenticatedUrl` rebuilds the URL from the origin and
  // clears the query (`url.search = ''`) before adding its launch token, so
  // the desktop markers have to be applied to its result. Passing an
  // already-marked URL through it silently drops them, which leaves the
  // renderer without `dsh-desktop-mode`; the desktop client plugin then
  // no-ops on `parseDesktopClientEnvironment`, never runs the advanced shell,
  // and never provides the `layout` service every sidebar row injects.
  const url = new URL(authenticate(`http://127.0.0.1:${String(port)}/`))
  url.searchParams.set('dsh-desktop-mode', mode)
  url.searchParams.set('dsh-desktop-platform', platform)
  return url.href
}

/**
 * Register the Electron shell from active Web carrier values.
 * @param ctx - Host context carrying the Electron adapter and Web carrier.
 * @param config - validated native window values.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = ctx.get('desktopRuntime')
  if (runtime === undefined) {
    process.stderr.write(
      'acryl-desktop: this profile is composed with the ACRYL shell, which requires the desktop launcher (desktopRuntime).\n'
      + 'Start it with `dsh-desktop`, or select this profile inside the packaged ACRYL application.\n'
      + 'The desktop terminal, profile, and update rows stay inactive in an ordinary DSH boot.\n',
    )
    return
  }
  const appExit = ctx.get('appExit')
  if (appExit === undefined) {
    throw new Error('acryl-desktop: the launcher did not provide ctx.appExit')
  }
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('acryl-desktop: desktop shell requires a loopback Web server')
  }
  const iconFilename = runtime.platform === 'darwin'
    ? 'app-icon-mac.png'
    : 'app-icon.png'
  const iconPath = fileURLToPath(new URL(`../build/${iconFilename}`, import.meta.url))
  const trayIcons = {
    templatePath: fileURLToPath(new URL('../build/tray-iconTemplate.png', import.meta.url)),
    bluePath: fileURLToPath(new URL('../build/tray-icon-blue.png', import.meta.url)),
  }
  const settings = ctx.settings.register(
    DESKTOP_SETTINGS_NAMESPACE,
    DesktopSettingsSchema,
    {
      applies: 'restart',
      validate: (value) => {
        if (value.mode === 'advanced' && runtime.platform === 'linux') {
          throw new Error('acryl-desktop: advanced shell mode is supported on macOS and Windows')
        }
      },
    },
  )
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const reportHostError = (operation: string, cause: unknown): void => {
    ctx.logger.error(
      `acryl-desktop: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  // Enabling/disabling/reloading a managed plugin hot-reloads its Host fiber in
  // place (the Loader entry / fiber restart in PluginLifecycleController), and the
  // renderer re-composes its own client boot graph via the renderer reload the
  // lifecycle API already requests (reloadPage -> location.reload()). A full
  // Desktop generation restart is NOT required here and would relaunch the whole
  // app, so this callback deliberately performs no restart — the client owns the
  // reload for the surface change, the Host owns the hot plugin swap.
  const afterPluginLifecycleMutation = (): void => {
    // Deliberate no-op: the Host fiber was already hot-reloaded and the client
    // reloads itself through the lifecycle receipt's rendererReloadRequired.
  }
  const pluginLifecycleBootstrap = ctx.get('desktopPluginLifecycleBootstrap')
  if (pluginLifecycleBootstrap === undefined) {
    throw new Error('acryl-desktop: launcher did not provide plugin lifecycle persistence')
  }
  const pluginLifecycle = new PluginLifecycleController(ctx, pluginLifecycleBootstrap)
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: PLUGIN_ARCHITECTURE_PATH,
      handler: (req, res) => handlePluginArchitectureSnapshotRequest(
        req,
        res,
        rendererOrigin,
        { snapshot: () => inspectCordisContext(ctx, 'host') },
        reportHostError,
      ),
    }),
    'acryl-desktop: private Cordis architecture route',
  )
  const lifecycleRoutes = [
    [PLUGIN_LIFECYCLE_PATH, handlePluginLifecycleSnapshotRequest],
    [PLUGIN_LIFECYCLE_ENABLE_PATH, handlePluginLifecycleEnableRequest],
    [PLUGIN_LIFECYCLE_DISABLE_PATH, handlePluginLifecycleDisableRequest],
    [PLUGIN_LIFECYCLE_RELOAD_PATH, handlePluginLifecycleReloadRequest],
  ] as const
  for (const [path, handler] of lifecycleRoutes) {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path,
        handler: (req, res) => handler(
          req,
          res,
          rendererOrigin,
          pluginLifecycle,
          reportHostError,
          afterPluginLifecycleMutation,
        ),
      }),
      `acryl-desktop: private plugin lifecycle route ${path}`,
    )
  }
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.effect(() => commandCtx.commands.register({
      name: 'reload',
      description: 'Reload managed ACRYL plugins and the Desktop generation',
      input: { hint: '[<loader-entry-id>]' },
      recordInput: false,
      handler: async ({ rawInput }) => {
        const entryId = rawInput.trim() || undefined
        try {
          const receipt = await pluginLifecycle.reload(entryId)
          setImmediate(() => {
            void runtime.requestRestart().catch(cause => { reportHostError('restart after /reload', cause) })
          })
          return {
            kind: 'success',
            text: `Reloading ${receipt.entryIds.join(', ')}.`,
          }
        } catch (cause) {
          return {
            kind: 'error',
            text: cause instanceof Error ? cause.message : 'Plugin reload failed.',
          }
        }
      },
    }), 'acryl-desktop: /reload command')
  })
  ctx.on('webserver/index-inject', table => {
    table.push(...desktopBootRecoveryInjections())
  })
  const desktopSettings = ctx.get('desktopSettingsController')
  if (desktopSettings !== undefined) {
    const settingsRoutes = [
      [DESKTOP_SETTINGS_PATH, handleDesktopSettingsRequest],
      [DESKTOP_PROFILE_CREATE_PATH, handleDesktopProfileCreateRequest],
      [DESKTOP_PROFILE_CREATE_WINDOW_PATH, handleDesktopProfileCreateWindowRequest],
      [DESKTOP_PROFILE_DELETE_PATH, handleDesktopProfileDeleteRequest],
      [DESKTOP_PROFILE_ROLLBACK_PATH, handleDesktopProfileRollbackRequest],
      [DESKTOP_PROFILE_SELECT_PATH, handleDesktopProfileSelectRequest],
      [DESKTOP_MARKET_SELECT_PATH, handleDesktopMarketSelectRequest],
      [DESKTOP_TERMINAL_OPEN_PATH, handleDesktopTerminalOpenRequest],
      [DESKTOP_DIAGNOSTICS_EXPORT_PATH, handleDesktopDiagnosticsExportRequest],
    ] as const
    for (const [path, handler] of settingsRoutes) {
      ctx.effect(
        () => ctx.webServer.register({
          kind: 'exact',
          path,
          handler: (req, res) => handler(
            req,
            res,
            rendererOrigin,
            desktopSettings,
            reportHostError,
          ),
        }),
        `acryl-desktop: private settings route ${path}`,
      )
    }
  }
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RENDERER_BOOT_REPORT_PATH,
      handler: (req, res) => handleRendererBootRequest(
        req,
        res,
        rendererOrigin,
        report => { runtime.reportRendererBoot(report) },
      ),
    }),
    'acryl-desktop: renderer boot report route',
  )
  if (runtime.platform === 'win32') {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: DESKTOP_DIRECTORY_PICKER_PATH,
        handler: (req, res) => handleDesktopDirectoryPickerRequest(
          req,
          res,
          rendererOrigin,
          () => runtime.pickDirectory(),
          cause => {
            ctx.logger.error(`acryl-desktop: native directory picker failed: ${cause instanceof Error ? cause.message : String(cause)}`)
          },
        ),
      }),
      'acryl-desktop: native directory picker route',
    )
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: DESKTOP_DIRECTORY_VALIDATOR_PATH,
        handler: (req, res) => handleDesktopDirectoryValidationRequest(
          req,
          res,
          rendererOrigin,
          path => runtime.validateDirectory(path),
          cause => {
            ctx.logger.error(`acryl-desktop: workspace directory validation failed: ${cause instanceof Error ? cause.message : String(cause)}`)
          },
        ),
      }),
      'acryl-desktop: workspace directory validation route',
    )
  }
  ctx.effect(() => {
    let pending: ReturnType<typeof setImmediate> | undefined
    const stopWatching = settings.watch((next) => {
      if (next.mode === config.mode && next.port === config.port) {
        if (pending !== undefined) clearImmediate(pending)
        pending = undefined
        return
      }
      pending ??= setImmediate(() => {
        pending = undefined
        void runtime.requestRestart().catch((cause: unknown) => {
          ctx.logger.error('acryl-desktop: failed to restart after startup setting change')
          ctx.logger.error(cause)
        })
      })
    })
    return () => {
      stopWatching()
      if (pending !== undefined) clearImmediate(pending)
    }
  }, 'acryl-desktop: restart after startup setting change')
  if (config.mode === 'advanced') {
    ctx.on('settings/updated', (namespace, next) => {
      if (namespace !== UI_THEME_SETTINGS_NAMESPACE) return
      runtime.setThemeSource((next as ThemeSettings).preference)
    })
  }
  ctx.on('settings/updated', (namespace, next) => {
    if (namespace !== UI_LOCALE_SETTINGS_NAMESPACE) return
    runtime.setLocalePreference(toDesktopLocale((next as LocaleSettings).preference))
  })
  // `desktopRendererUrl` alone is unauthenticated: the shared Connection
  // cookie gate (dsh-client-connection's browser-auth) 401s any request
  // that skips the launch-token exchange — the same "authenticatedUrl" step
  // `dsh web` runs before printing/opening its own URL — so the
  // BrowserWindow's very first navigation must carry the token too, or its
  // renderer never gets past the 401 page and boot health times out.
  // `connection` is injected scoped here (not in this plugin's own static
  // `inject` array) so a deployment that never mounts dsh-client-connection
  // degrades to the unauthenticated URL instead of leaving this whole
  // plugin permanently pending.
  ctx.inject(['connection'], connectionCtx => {
    connectionCtx.effect(
      () => runtime.schedule({
        ...config,
        url: desktopRendererUrl(
          ctx.webServer.port,
          config.mode,
          runtime.platform,
          baseUrl => connectionCtx.connection.authenticatedUrl(baseUrl),
        ),
        productName: 'ACRYL',
        windowTitle: 'ACRYL',
        iconPath,
        trayIcons,
        readLocalePreference: () => {
          return toDesktopLocale((ctx.settings.get(UI_LOCALE_SETTINGS_NAMESPACE) as LocaleSettings | undefined)?.preference)
        },
        readThemeSource: () => {
          const theme = ctx.settings.get(UI_THEME_SETTINGS_NAMESPACE) as ThemeSettings | undefined
          if (theme === undefined) {
            throw new Error('acryl-desktop: advanced shell requires the ui-theme settings namespace')
          }
          return theme.preference
        },
        requestQuit: appExit,
        requestModeChange: async mode => settings.update({ mode }),
      }),
      'acryl-desktop: native shell generation',
    )
  })
}
