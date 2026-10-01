/**
 * The generic three-column desktop/web app frame: sidebar column, main surface, resizable details column,
 * platform title-bar spacing, theme presentation. One plugin claims it for its own UI (`applyAdvancedShell`),
 * via the same `desktop.main`/`desktop.sidebar` slot contract regardless of which domain the caller is -
 * the IDE (`plugins/acryl-workspace`) and a GTD, accounting or any other Blend's own main-surface plugin
 * all use exactly this, never a Host-served page of their own (see
 * `specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md` section 0 for why).
 */

export { applyAdvancedShell, type AdvancedShellHooks } from './advanced-shell.ts'
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
