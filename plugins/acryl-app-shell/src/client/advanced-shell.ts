import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Pulls `ctx.slots` and the `root` SlotMap key augmentation into this module (and, as a plain import rather
// than `import type {}`, into every program that imports this package's types - see `client/index.ts`'s own
// copy of this note).
import '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@acryl/ui/frame'
import type { ReactNode } from 'react'
import type { DesktopMainOwnerProps, DesktopSidebarSurfaceOwnerProps } from './contracts.ts'
import type { ShellEnvironment } from './environment.ts'
import { AdvancedFrame } from './AdvancedFrame.tsx'
import { DesktopLayoutState } from './layout-state.ts'
import { provideDesktopLayout } from './layout-service.ts'
import { installAdvancedStyles } from './styles.ts'
import { DesktopThemePresenter } from './theme-presenter.ts'

function DefaultDesktopMain({ renderConversation }: DesktopMainOwnerProps) {
  return renderConversation()
}

function DefaultDesktopSidebar({ renderUpstream }: DesktopSidebarSurfaceOwnerProps) {
  return renderUpstream()
}

/** Optional wrappers a domain plugin's own call site supplies - see `AdvancedFrameInjected`. Neither key
 * is ever required: a Blend that needs no extra chrome around its main or details column passes nothing. */
export interface AdvancedShellHooks {
  readonly wrapMain?: (content: ReactNode) => ReactNode
  readonly wrapRightbar?: (content: ReactNode) => ReactNode
}

/**
 * Claim the three-column desktop/web app frame for this plugin's own UI: register `desktop.main` and
 * `desktop.sidebar` (falling back to the unchanged upstream chat and sidebar until something replaces
 * them), mount the layout service, theme presenter and chrome styles, and own the `root` slot that
 * composes everything into `AdvancedFrame`. Call once, from the plugin that is this Blend's main-surface
 * owner (the IDE's `plugins/acryl-workspace`, or a domain plugin like a GTD or accounting Blend) - never
 * from more than one plugin in the same program, since `root` is a single slot.
 * @param ctx - active browser Cordis context.
 * @param environment - validated mode and platform marker (`resolveShellEnvironment`).
 * @param hooks - optional column wrappers (a terminal dock, or anything else a caller wants beneath/beside
 * the main or details column); this package has no opinion on what they wrap.
 */
export function applyAdvancedShell(ctx: ClientContext, environment: ShellEnvironment, hooks: AdvancedShellHooks = {}): void {
  if (environment.mode !== 'advanced') {
    throw new Error(`acryl-app-shell: advanced shell received mode ${JSON.stringify(environment.mode)}`)
  }

  const desktopLayout = new DesktopLayoutState()
  ctx.effect(
    () => provideDesktopLayout(ctx, desktopLayout),
    'acryl-app-shell: layout service',
  )
  // Upstream's sidebars and session views read the open keyed panel through the standard `usePanelInfo` hook, which the root supplies.
  ctx.effect(() => ctx.slots.provideRoot({ hooks: { panelInfo: desktopLayout.panelInfo } }), 'acryl-app-shell: panel info')

  ctx.effect(() => {
    document.body.dataset.dshDesktopMode = 'advanced'
    document.body.dataset.dshDesktopPlatform = environment.platform
    const removeStyles = installAdvancedStyles()
    return () => {
      removeStyles()
      delete document.body.dataset.dshDesktopMode
      delete document.body.dataset.dshDesktopPlatform
    }
  }, 'acryl-app-shell: advanced shell styles')

  ctx.slots.inject('desktop.main', () => ctx.slots.register({
    name: 'desktop.main',
    priority: 100,
  }, DefaultDesktopMain))

  ctx.slots.inject('desktop.sidebar', () => ctx.slots.register({
    name: 'desktop.sidebar',
    priority: 100,
  }, DefaultDesktopSidebar))

  ctx.effect(() => {
    const presenter = new DesktopThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', snapshot => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'acryl-app-shell: theme presenter')

  ctx.effect(() => ctx.slots.register({
    name: 'root',
    children: {
      'desktop.main': { kind: 'single', scope: 'root' },
      'desktop.sidebar': { kind: 'single', scope: 'root' },
      'sidebar': { kind: 'single', scope: 'root' },
      'main': { kind: 'keyed', scope: 'root' },
      'rightbar': { kind: 'single', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'shell.leading': { kind: 'single', scope: 'root' },
    },
    inject: () => ({ layout: desktopLayout, platform: environment.platform, ...hooks }),
  }, AdvancedFrame), 'acryl-app-shell: advanced root slot')
}
