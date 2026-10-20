/**
 * The generic three-column desktop/web app frame: sidebar column, main surface, resizable details column,
 * platform title-bar spacing, theme presentation. One plugin claims it for its own UI (`applyAdvancedShell`),
 * via the same `desktop.main`/`desktop.sidebar` slot contract regardless of which domain the caller is -
 * the IDE (`plugins/acryl-workspace`) and a GTD, accounting or any other Blend's own main-surface plugin
 * all use exactly this, never a Host-served page of their own (see
 * `specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md` section 0 for why).
 *
 * This module is a library another plugin's own client code calls into (`applyAdvancedShell`), not a plugin
 * in its own right - but the browser boot sequence (`deepseek-harness` `client/web`'s `runPluginBoot`)
 * activates every row with a declared `dsh.client` bundle as its own Cordis plugin, same as the Host side
 * already does for this package. That activation owns no slot (no slot is owned without a caller invoking
 * `applyAdvancedShell` itself); it starts the page's health record (`ui-health.ts`: stalls, long tasks and
 * runaway error loops), which every surface hosting the frame should keep.
 */

import type { Context } from '@deepseek-ai/cordis'
import { browserLongTasks, startUiHealth, type UiHealthRecord } from './ui-health.ts'

/** Stable Cordis plugin name, matching the Host side. */
export const name = 'acryl-app-shell'

declare global {
  interface Window {
    /** The page's health record (`ui-health.ts`), readable from DevTools and by diagnostics. */
    __acrylHealth?: UiHealthRecord
  }
}

/** Start the health record for the page's lifetime. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const health = startUiHealth({
      now: () => performance.now(),
      setInterval: (callback, ms) => { const timer = window.setInterval(callback, ms); return () => { window.clearInterval(timer) } },
      console: window.console,
      isVisible: () => document.visibilityState === 'visible',
      observeLongTasks: onTask => browserLongTasks(onTask) ?? (() => {}),
    })
    window.__acrylHealth = health.record
    return () => {
      health.stop()
      if (window.__acrylHealth === health.record) delete window.__acrylHealth
    }
  }, 'acryl-app-shell: page health record')
}

export { applyAdvancedShell, type AdvancedShell, type AdvancedShellHooks } from './advanced-shell.ts'
export { startUiHealth, type UiHealthIncident, type UiHealthOptions, type UiHealthPorts, type UiHealthRecord } from './ui-health.ts'
export { AGENT_PANEL_RAIL, AgentPanel, type AgentPanelProps } from './AgentPanel.tsx'
export { AdvancedFrame, type AdvancedFrameInjected, type AdvancedFrameProps } from './AdvancedFrame.tsx'
export {
  type DesktopLayoutService,
  type DesktopMainOwnerProps,
  type DesktopRightbarOwnerProps,
  type DesktopSidebarOwnerProps,
  type DesktopSidebarSurfaceOwnerProps,
} from './contracts.ts'
export {
  resolveShellEnvironment,
  WEB_SHELL_ENVIRONMENT,
  type ShellEnvironment,
  type ShellMode,
  type ShellPlatform,
} from './environment.ts'
export { DesktopLayoutState, MACOS_SIDEBAR_COLLAPSED, SIDEBAR_COLLAPSED, solveFrame } from './layout-state.ts'
export { provideDesktopLayout } from './layout-service.ts'
export { installAdvancedStyles } from './styles.ts'
export { DesktopThemePresenter } from './theme-presenter.ts'
export {
  MACOS_DRAG_REGION_HEIGHT,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHT_SAFE_WIDTH,
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_TITLEBAR_HEIGHT,
} from './chrome-metrics.ts'
