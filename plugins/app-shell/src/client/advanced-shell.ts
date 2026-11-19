import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Pulls `ctx.slots` and the `root` SlotMap key augmentation into this module (and, as a plain import rather
// than `import type {}`, into every program that imports this package's types - see `client/index.ts`'s own
// copy of this note).
import '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@acryldev/ui/frame'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { ReactNode } from 'react'
import type { DesktopMainOwnerProps, DesktopSidebarSurfaceOwnerProps } from './contracts.ts'
import type { ShellEnvironment } from './environment.ts'
import { AdvancedFrame } from './AdvancedFrame.tsx'
import { SettingsTrigger } from './SettingsTrigger.tsx'
import { DSH_SIDEBAR_ENTRY, rootOwnsSettingsSeat } from './settings-seat.ts'
import { stripLaunchToken } from './launch-token.ts'
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

/** What the frame tells its caller after claiming it. */
export interface AdvancedShell {
  /** Whether the right column is shown, followed live: the right sidebar reports it to the frame as it opens and closes. */
  readonly rightPanel: {
    isShown(): boolean
    subscribe(listener: () => void): () => void
  }
}

/**
 * Claim the three-column desktop/web app frame for this plugin's own UI: register `desktop.main` and
 * `desktop.sidebar` (falling back to the unchanged upstream chat and sidebar until something replaces
 * them), mount the layout service, theme presenter and chrome styles, and own the `root` slot that
 * composes everything into `AdvancedFrame`. Call once, from the plugin that is this Blend's main-surface
 * owner (the IDE's `plugins/workspace`, or a domain plugin like a GTD or accounting Blend) - never
 * from more than one plugin in the same program, since `root` is a single slot.
 * @param ctx - active browser Cordis context.
 * @param environment - validated mode and platform marker (`resolveShellEnvironment`).
 * @param hooks - optional column wrappers (a terminal dock, or anything else a caller wants beneath/beside
 * the main or details column); this package has no opinion on what they wrap.
 * @returns the frame's right column state, for a control that opens and closes it.
 */
export function applyAdvancedShell(ctx: ClientContext, environment: ShellEnvironment, hooks: AdvancedShellHooks = {}): AdvancedShell {
  if (environment.mode !== 'advanced') {
    throw new Error(`@acryldev/app-shell: advanced shell received mode ${JSON.stringify(environment.mode)}`)
  }

  const desktopLayout = new DesktopLayoutState()
  ctx.effect(
    () => provideDesktopLayout(ctx, desktopLayout),
    '@acryldev/app-shell: layout service',
  )
  // Upstream's sidebars and session views read the open keyed panel through the standard `usePanelInfo` hook, which the root supplies.
  ctx.effect(() => ctx.slots.provideRoot({ hooks: { panelInfo: desktopLayout.panelInfo } }), '@acryldev/app-shell: panel info')

  // The launch token was exchanged for the browser's cookie before this client ran. Left in the address bar it stays
  // in history and a reconnect can spend it again, re-admitting a page whose cookie is gone - so the session-ended
  // banner would never be due. Drop it once, keeping the path, any other query field and the hash.
  ctx.effect(() => {
    const stripped = stripLaunchToken(window.location.href)
    if (stripped !== undefined) window.history.replaceState(window.history.state, '', stripped)
    return () => {}
  }, '@acryldev/app-shell: strip the launch token')

  ctx.effect(() => {
    document.body.dataset.dshDesktopMode = 'advanced'
    document.body.dataset.dshDesktopPlatform = environment.platform
    const removeStyles = installAdvancedStyles()
    return () => {
      removeStyles()
      delete document.body.dataset.dshDesktopMode
      delete document.body.dataset.dshDesktopPlatform
    }
  }, '@acryldev/app-shell: advanced shell styles')

  ctx.slots.inject('desktop.main', () => ctx.slots.register({
    name: 'desktop.main',
    priority: 100,
  }, DefaultDesktopMain))

  ctx.slots.inject('desktop.sidebar', () => ctx.slots.register({
    name: 'desktop.sidebar',
    priority: 100,
  }, DefaultDesktopSidebar))

  // DSH's left sidebar declares the `sidebar.settings` seat and fills its launcher with its own gear (ACRYL Desktop). Without it in the page
  // (ACRYL ADE, or Desktop with the plugin switched off) this root declares the seat and gives DSH's Settings modal an out-of-sight launcher,
  // or the modal is never drawn. Declaring the seat beside DSH's sidebar fails its activation ("slot sidebar.settings is already declared"),
  // so it is one or the other - and which one follows the sidebar at runtime: the seat belongs to this registration's children, so the root
  // re-registers, without the seat, before the sidebar activates, and with it again after the sidebar unloads.
  // `loader` is optional: without one (a program composing this root by hand) the root owns the seat.
  const loader = ctx.get('loader')
  let ownsSettingsSeat = loader === undefined || rootOwnsSettingsSeat(loader.entries())
  let rootDispose: (() => void) | undefined
  let triggerDispose: (() => void) | undefined
  const rigRoot = () => {
    triggerDispose?.()
    triggerDispose = undefined
    rootDispose?.()
    rootDispose = undefined
    if (ownsSettingsSeat) {
      triggerDispose = ctx.slots.inject('settings.launcher', () => ctx.slots.register({
        name: 'settings.launcher',
        priority: 100,
      }, SettingsTrigger))
    }
    rootDispose = ctx.slots.register({
      name: 'root',
      children: {
        'desktop.main': { kind: 'single', scope: 'root' },
        'desktop.sidebar': { kind: 'single', scope: 'root' },
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
        'rightbar': { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
        // DSH's Settings modal and its launcher (`dsh-client-ui-settings-general`), drawn in the left pane (SettingsTrigger.tsx).
        ...(ownsSettingsSeat ? { 'sidebar.settings': { kind: 'single', scope: 'root' } as const } : {}),
      },
      inject: () => ({ layout: desktopLayout, platform: environment.platform, ownsSettingsSeat, ...hooks }),
    }, AdvancedFrame)
  }

  ctx.effect(() => {
    const presenter = new DesktopThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', snapshot => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, '@acryldev/app-shell: theme presenter')

  ctx.effect(() => {
    rigRoot()
    return () => {
      rootDispose?.()
      rootDispose = undefined
      triggerDispose?.()
      triggerDispose = undefined
    }
  }, '@acryldev/app-shell: advanced root slot')

  // Follow DSH's left sidebar entry while `loader` is available (optional: without it the root owns the seat). The decision reads the entry,
  // never its fiber. A sidebar starting is seen before its own apply declares the seat; a stopping one collapses its declarations only as its
  // fiber unloads, so the root re-registers with the seat once the loader has settled, not inside the disposal event.
  ctx.inject(['loader'], inner => {
    const decide = () => {
      const next = rootOwnsSettingsSeat(inner.loader.entries())
      if (next === ownsSettingsSeat) return
      ownsSettingsSeat = next
      rigRoot()
    }
    inner.effect(() => {
      const settled = () => {
        void inner.loader.await().then(decide, () => {})
      }
      const offFiber = inner.root.on('internal/plugin', fiber => {
        if (fiber.entry?.options.name !== DSH_SIDEBAR_ENTRY) return
        if (fiber.uid !== null) decide()
        else settled()
      })
      // A group's own update (the sidebar disabled through its parent group) patches its context; its children's fibers report themselves.
      const offUpdate = inner.root.on('loader/partial-dispose', entry => {
        if (entry.options.name === DSH_SIDEBAR_ENTRY || entry.options.group) settled()
      })
      decide()
      return () => {
        offFiber()
        offUpdate()
      }
    }, '@acryldev/app-shell: settings seat follows DSH\'s sidebar')
  })

  return {
    rightPanel: {
      isShown: () => desktopLayout.getSnapshot().detailsShown,
      subscribe: listener => desktopLayout.subscribe(listener),
    },
  }
}
