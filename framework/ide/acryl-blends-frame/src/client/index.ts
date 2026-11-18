/**
 * Cordis Client plugin: the Blends frame owns the page's `root` slot and draws the workbench around the app (docs/design/blends-frame-mockup.html).
 * It composes no IDE workbench: the ACRYL IDE keeps its own root owner (`acryl-workspace` through `acryl-app-shell`), and a Blueprint mounts one
 * of the two, never both, since `root` is a single slot.
 */

// Pulls `ctx.slots` and the `root` SlotMap key augmentation into this module.
import '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@acryl/ui/frame'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// The conversation slot maps (the composer overlay the chip sits in) and the scoped input events the send hook writes through.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DesktopLayoutState, DesktopThemePresenter, provideDesktopLayout, stripLaunchToken } from 'acryl-app-shell/client'
import { createVersionsApi } from 'acryl-versions/client'
import { ChatSavesStore, createChatSavesApi } from './chat-saves.ts'
import { TurnSaveFooter } from './TurnSaveFooter.tsx'
import { BlendsFrame } from './BlendsFrame.tsx'
import { AppCanvasState } from './canvas/app-canvas.ts'
import { ChatsStore, createRealChatsApi, type MainViewNavigation, type WorkspaceRegistration } from './chats.ts'
import { AppReloadStore } from './app-reload.ts'
import { FrameStateStore } from './frame-state.ts'
import { FILES_SEARCH_EVENT } from './FilesView.tsx'
import { AgentsState, agentsSettingsPlugin, createWorkspaceAgentsApi, settingsSharedPlugin } from 'acryl-workspace/ui'
import { ShortcutsRow } from './ShortcutsRow.tsx'
import { createBranchesApi } from './branches.ts'
import { BranchChatsStore, createBranchChatsApi } from './branch-chats.ts'
import { createFeedbackApi, feedbackTask } from './feedback.ts'
import { installFrameView } from './frame-view.ts'
import { attachDraft, draftInChat } from './chat-draft.ts'
import type { FeedbackPort } from './LeftPanel.tsx'
import { appPluginRow, createAppPluginsApi, framePluginRow, type NavigatorPlugin } from './plugins-navigator.ts'
import { PluginsSection } from './PluginsSection.tsx'
import { createRegistryApi } from './registry-api.ts'
import { AppSection } from './AppSection.tsx'
import { desktopApp } from './desktop-app.ts'
import { NameYourApp } from './NameYourApp.tsx'
import { SelectionChip, type SelectionChipInjected } from './SelectionChip.tsx'
import { SelectionStore, carriesSelection, handOffSelection } from './selection.ts'
import { SettingsExpand } from './SettingsExpand.tsx'
import { SettingsLauncher } from './SettingsLauncher.tsx'
import { installFrameStyles } from './styles.ts'
import { inspectCordisContext } from '../graph-inspect.ts'
import { createGraphApi } from './graph-api.ts'
import type { GraphViewInjected } from './GraphView.tsx'
import { FILES_TAB, fileTab, FrameTabs, tabOfTerminal } from './tabs.ts'
import { SwitchRequests } from './switch-request.ts'
import { createFrameTools, installXtermStyles } from './tools.ts'
import { createSharedVersionsApi } from './versions.ts'
import { createGitSyncApi, type GitSyncPort } from './git-sync.ts'
import { createSnapshotApi } from './snapshot.ts'
import { FrameViewState, type ViewStorage } from './view-state.ts'
import { ThemeSwitch } from './theme-switch.ts'

// `sidebarRight` on the context: DSH's right sidebar controller, drawn in the right panel's Panel tab.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { watchSidebarOpens } from './sidebar-opens.ts'
import type { SidebarPort } from './RightPanel.tsx'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The centre canvas: `ctx.appCanvas.address()`, `.navigate(path)`, `.reload()`, `.pageWindow()`. */
    appCanvas: AppCanvasState
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.blendsFrame': 'plugins' | 'app'
  }
}

const LOCALE_NAMESPACE = 'acryl.blendsFrame'
/** The Loader row that composes the app's own plugins (`frame/app-plugins.mjs`): loading it again applies a switch in `blend.yaml`. */

export const name = 'acryl-blends-frame-client'

/** How often a visible frame reads its state again (branches, the newest version, unsaved files). */
const FRAME_STATE_INTERVAL_MS = 5000
// `theme` is read by the theme presenter; Cordis rejects reading a service a plugin did not declare.
export const inject = ['slots', 'theme']

/** The frame's own first run: a step that stays pending and renders nothing, so DSH's blocking steps never mount inside the frame. */
function NoOnboarding(): null {
  return null
}

function pageStorage(): ViewStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function apply(ctx: ClientContext): void {
  const layout = new DesktopLayoutState()
  const canvas = new AppCanvasState()
  const selection = new SelectionStore()
  const frameState = new FrameStateStore()
  // The app's code loaded again (a version restored, a file written by anyone): the canvas reloads on it, and the versions and unsaved count are read again.
  const appReload = new AppReloadStore(() => { canvas.reload(); void frameState.refresh() })
  const view = new FrameViewState(pageStorage())
  const themeSwitch = new ThemeSwitch(ctx.theme)
  // `uiWorkspace` (DSH's navigation) and `workspaces` (its workspace registry) are DSH services this package does not import the types of; the
  // small interfaces in `./chats.ts` describe the calls it makes, so a frame without them composed still works.
  const branchChats = new BranchChatsStore(createBranchChatsApi())
  const tabs = new FrameTabs(pageStorage())
  const switchRequests = new SwitchRequests()
  const checkedOut = (): string | undefined => {
    const current = frameState.getSnapshot()
    return current.status === 'ready' ? current.state.branches.find(branch => branch.current)?.name : undefined
  }
  const chats = new ChatsStore({
    navigation: () => (ctx.get as (name: string) => MainViewNavigation | undefined)('uiWorkspace'),
    workspaceFor: () => (ctx.get as (name: string) => WorkspaceRegistration | undefined)('workspaces'),
    realChats: createRealChatsApi(),
    branchChats,
    tabs,
    branch: checkedOut,
    appRoot: () => { const current = frameState.getSnapshot(); return current.status === 'ready' ? current.state.appRoot : undefined },
    // A chat tab of the strip that is showing on the checked-out branch asks for its own chat to be the one on screen.
    preferred: () => {
      const strip = tabs.getSnapshot()
      const active = strip.tabs.find(tab => tab.id === strip.active)
      return active?.kind === 'chat' && active.session !== undefined && active.branch === checkedOut() ? active.session : undefined
    },
  })
  const versionsApi = createVersionsApi()
  const sharedVersionsApi = createSharedVersionsApi()
  const branchesApi = createBranchesApi()
  const gitSyncApi = createGitSyncApi()
  const snapshot = createSnapshotApi()
  // A push moves the upstream (the left panel's shared marks), a pull the head and the app's files: the frame reads its state again, and the app page reloads when a pull brought versions in.
  const gitSync: GitSyncPort = {
    remote: fetchFirst => gitSyncApi.remote(fetchFirst),
    planPush: () => gitSyncApi.planPush(),
    push: async (confirmed) => {
      const result = await gitSyncApi.push(confirmed)
      await frameState.refresh()
      return result
    },
    pull: async () => {
      const headOf = (): string | undefined => { const view = frameState.getSnapshot(); return view.status === 'ready' ? view.state.head : undefined }
      const before = headOf()
      const result = await gitSyncApi.pull()
      await frameState.refresh()
      if (headOf() !== before) canvas.reload()
      return result
    },
  }
  const tools = createFrameTools()
  // The line under an answer that changed the app: what the Host's auto-save made of the turn. A new save changes the versions and the unsaved count, so the frame reads its state again.
  const chatSaves = new ChatSavesStore(createChatSavesApi(), () => { void frameState.refresh() })
  // Feedback from users: the notes, and handing one to the chat as a task the builder reads and sends.
  const feedbackApi = createFeedbackApi()
  const feedback: FeedbackPort = {
    api: feedbackApi,
    async hand(note) {
      const current = chats.getSnapshot().find(row => row.current)
      if (current === undefined) return false
      tabs.activate(tabs.chatTabId(current.id))
      view.showRight()
      // The screenshot becomes a real attachment of the message (DSH's own draft intake), so the agent sees it with the text.
      if (note.screenshot !== undefined) {
        try {
          const response = await fetch(feedbackApi.shotUrl(note.id), { credentials: 'same-origin', cache: 'no-store' })
          if (response.ok) {
            const blob = await response.blob()
            const extension = note.screenshot.mediaType === 'image/png' ? 'png' : 'webp'
            attachDraft(ctx, current.id, new File([blob], `feedback-${note.id}.${extension}`, { type: note.screenshot.mediaType }))
          }
        } catch {
          // A screenshot that cannot be read does not stop the note: the page and selector still reach the chat.
        }
      }
      return draftInChat(ctx, current.id, feedbackTask(note))
    },
  }

  ctx.effect(() => provideDesktopLayout(ctx, layout), 'acryl-blends-frame: layout service')
  // DSH's views read the open keyed panel through the standard `usePanelInfo` hook, which the root supplies.
  ctx.effect(() => ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } }), 'acryl-blends-frame: panel info')
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('appCanvas', canvas)
    return () => { void dispose() }
  }, 'acryl-blends-frame: the canvas service')
  // The app's own client plugins read the frame's mode from the canvas page: Build keeps their build-time controls out of the canvas, Preview shows
  // what production shows, and a mode change reaches them without a reload.
  ctx.effect(() => installFrameView(canvas, view), 'acryl-blends-frame: the app page view')
  // DSH's right sidebar (`dsh-client-ui-sidebar-right`) is drawn inside the right panel's Panel tab: each page opened in it brings the tab forward, and
  // closing the tab collapses the sidebar, which DSH's controller owns. Until the sidebar is mounted there is nothing to collapse.
  let sidebarRight: Pick<ClientContext['sidebarRight'], 'isExpanded' | 'toggleExpanded'> | undefined
  const sidebarOpens = new Set<() => void>()
  ctx.inject(['sidebarRight'], (child) => {
    child.effect(() => {
      sidebarRight = child.sidebarRight
      const stop = watchSidebarOpens(child.sidebarRight, () => { for (const listener of sidebarOpens) listener() })
      return () => {
        stop()
        sidebarRight = undefined
      }
    }, 'acryl-blends-frame: the right sidebar')
  })
  const sidebar: SidebarPort = {
    close: () => { if (sidebarRight?.isExpanded() === true) sidebarRight.toggleExpanded() },
    expand: () => { if (sidebarRight?.isExpanded() === false) sidebarRight.toggleExpanded() },
    onOpened: (listener) => {
      sidebarOpens.add(listener)
      return () => { sidebarOpens.delete(listener) }
    },
  }

  // The launch token was exchanged for the cookie before this client ran; left in the address bar a reconnect could spend it again.
  ctx.effect(() => {
    const stripped = stripLaunchToken(window.location.href)
    if (stripped !== undefined) window.history.replaceState(window.history.state, '', stripped)
    return () => {}
  }, 'acryl-blends-frame: strip the launch token')

  ctx.effect(() => installFrameStyles(), 'acryl-blends-frame: styles')
  ctx.effect(() => installXtermStyles(), 'acryl-blends-frame: terminal styles')
  // A terminal whose process ended, or that the Host no longer knows (it restarted), leaves the strip; its title names what it runs.
  ctx.effect(() => {
    const closeTabOf = (terminalId: string) => {
      const tab = tabOfTerminal(tabs.getSnapshot(), terminalId)
      if (tab !== undefined) tabs.close(tab.id)
      tools.terminals.release(terminalId)
    }
    const offLost = tools.terminals.onLost(closeTabOf)
    const offExit = tools.terminals.onExit(closeTabOf)
    const offTitle = tools.terminals.onTitle((terminalId, title) => { tabs.setTitle(terminalId, title) })
    return () => {
      offLost()
      offExit()
      offTitle()
      tools.terminals.disposeAll()
    }
  }, 'acryl-blends-frame: terminal sessions')
  // ⌘P (Ctrl P) anywhere in the frame: Files, with its search taking the keys.
  ctx.effect(() => {
    const quickOpen = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
      event.preventDefault()
      tabs.open(FILES_TAB)
      view.showRight()
      window.setTimeout(() => { window.dispatchEvent(new Event(FILES_SEARCH_EVENT)) }, 0)
    }
    window.addEventListener('keydown', quickOpen, true)
    return () => { window.removeEventListener('keydown', quickOpen, true) }
  }, 'acryl-blends-frame: quick open')
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name: 'settings.launcher' }, SettingsLauncher))
  // Settings' header: a button that makes the window fill the browser window (DSH's list slot, between "Open configuration file" and the close button).
  ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'blends-expand', order: 20 }, SettingsExpand))
  ctx.effect(() => {
    const presenter = new DesktopThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', snapshot => {
      presenter.apply(snapshot)
      themeSwitch.refresh()
    })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'acryl-blends-frame: theme presenter')

  ctx.effect(() => {
    const read = () => { if (document.visibilityState === 'visible') void frameState.refresh() }
    void frameState.refresh()
    const timer = window.setInterval(read, FRAME_STATE_INTERVAL_MS)
    document.addEventListener('visibilitychange', read)
    // Back from another window (an editor, a terminal) the count is read at once, not at the next tick.
    window.addEventListener('focus', read)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
      window.removeEventListener('focus', read)
    }
  }, 'acryl-blends-frame: read the frame state')

  ctx.effect(() => {
    const controller = new AbortController()
    void appReload.run(controller.signal)
    return () => { controller.abort() }
  }, "acryl-blends-frame: follow the app's code")

  // A chat belongs to the branch it was made on (`./branch-chats.ts`), and the chat on screen always belongs to the checked-out branch: the store makes it
  // so whenever the branch, the sessions, the chats with a turn, the map or the strip's chat tab changes (`ChatsStore.reconcile`).
  ctx.effect(() => {
    void branchChats.load()
    const reconcile = () => { chats.reconcile() }
    const offState = frameState.subscribe(reconcile)
    const offMap = branchChats.subscribe(reconcile)
    const offTabs = tabs.subscribe(reconcile)
    // The strip follows the chat on screen: when it changes (a branch switch, a row opened) and a chat tab is the one showing, the tab of that chat is.
    let shown: string | undefined
    const follow = () => {
      const current = chats.getSnapshot().find(row => row.current)?.id
      if (current === shown) return
      shown = current
      if (current === undefined) return
      const strip = tabs.getSnapshot()
      if (strip.tabs.find(tab => tab.id === strip.active)?.kind === 'chat') tabs.activate(tabs.chatTabId(current))
    }
    const offChats = chats.subscribe(follow)
    // A chat that is not open has no tab: the strip drops the tabs of chats closed elsewhere (another page, or before chats could be closed).
    const prune = () => { if (branchChats.isOpenKnown()) tabs.closeChatsNotIn(branchChats.getOpen()) }
    const offPrune = branchChats.subscribe(prune)
    prune()
    reconcile()
    return () => {
      offState()
      offMap()
      offTabs()
      offChats()
      offPrune()
    }
  }, 'acryl-blends-frame: the chat on screen is the checked-out branch\'s')

  // Settings → Agents: the workspace's own section, on the workspace Host's agent routes.
  const agents = new AgentsState(createWorkspaceAgentsApi())
  ctx.effect(() => { void agents.refresh(); return () => {} }, 'acryl-blends-frame: load the agents')
  ctx.plugin(settingsSharedPlugin())
  ctx.plugin(agentsSettingsPlugin(agents))

  // Settings → Plugins: the app's plugins, each with its switch, and the frame's own; the Host starts the app's plugins again after a switch.
  const appPlugins = createAppPluginsApi()
  const registry = createRegistryApi()
  // View source: the plugin's main file opens as a tab of the right panel's Files tool, which is shown if it was hidden.
  const sourceAction = (main: string | undefined): (() => void) | undefined => main === undefined ? undefined : () => {
    view.showRight()
    tabs.open(fileTab(main))
  }
  const loadPlugins = async (): Promise<readonly NavigatorPlugin[]> => {
    const listed = await appPlugins.read()
    return [
      ...listed.plugins.map(plugin => {
        const viewSource = sourceAction(plugin.main)
        return appPluginRow(
          plugin,
          async (on) => {
            await appPlugins.switch(plugin.kind, plugin.name, on)
            canvas.reload()
          },
          plugin.kind === 'made' ? { plan: target => appPlugins.planShare(plugin.name, target), publish: confirmed => appPlugins.share(plugin.name, confirmed) } : undefined,
          undefined,
          {
            ...(plugin.kind === 'made' ? { save: () => appPlugins.save(plugin.name) } : {}),
            ...(viewSource === undefined ? {} : { viewSource }),
          },
        )
      }),
      ...listed.frame.map(plugin => {
        const viewSource = sourceAction(plugin.main)
        return framePluginRow(plugin, viewSource === undefined ? undefined : { viewSource })
      }),
    ]
  }
  // Settings → Plugins → Graph: the Host's plugins (the app's and the frame's) from the Host's routes, the browser's own from this context. Opening a plugin's
  // code is a tab of the Files tool, shown if it was hidden; the path is from the app's folder.
  const graph: GraphViewInjected = {
    api: createGraphApi(),
    client: {
      inspect: () => inspectCordisContext(ctx, 'client'),
      subscribe: (listener) => {
        const phase = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'] as const
        const named = (fiber: { readonly name: string }): string => fiber.name
        const offPlugin = ctx.root.on('internal/plugin', (fiber) => { listener({ uid: fiber.uid ?? 0, name: named(fiber), kind: fiber.uid === null ? 'removed' : 'created' }) })
        const offStatus = ctx.root.on('internal/status', (fiber, before) => {
          listener({ uid: fiber.uid ?? 0, name: named(fiber), kind: 'status', from: phase[before] ?? 'pending', to: phase[fiber.state] ?? 'pending' })
        })
        return () => { offPlugin(); offStatus() }
      },
    },
    openSource: (path) => {
      view.showRight()
      tabs.open(fileTab(path))
    },
  }
  // A desktop product's window: its App page in Settings, and the first start's question (`./desktop-app.ts`); a browser tab has neither.
  const desktop = desktopApp()
  if (desktop !== undefined) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'acryl-blends-name-app',
      inject: () => ({ app: desktop }),
    }, NameYourApp))
  }
  ctx.plugin({
    name: 'acryl-blends-frame-plugins-settings',
    inject: ['slots', 'locale'],
    apply(child: ClientContext): void {
      child.effect(() => child.locale.register(LOCALE_NAMESPACE, { en: { plugins: 'Plugins', app: 'App' }, zh: { plugins: '插件', app: '应用' } }), 'acryl-blends-frame: dictionary')
      const t = child.locale.bind(LOCALE_NAMESPACE)
      if (desktop !== undefined) {
        child.slots.inject('settings.section', () => child.slots.register({
          name: 'settings.section',
          id: 'acryl-blends-app',
          // After General, before Models (10).
          order: 5,
          label: () => t('app'),
          locale: LOCALE_NAMESPACE,
          inject: () => ({ app: desktop }),
        }, AppSection))
      }
      child.slots.inject('settings.section', () => child.slots.register({
        name: 'settings.section',
        id: 'acryl-blends-plugins',
        // After Models and Agents, before Support (90).
        order: 45,
        label: () => t('plugins'),
        locale: LOCALE_NAMESPACE,
        inject: () => ({ loadPlugins, graph, registry }),
      }, PluginsSection))
    },
  })

  // Settings > General: a short list of the shortcuts.
  ctx.plugin({
    name: 'acryl-blends-frame-shortcuts-row',
    inject: ['slots', 'shortcuts'],
    apply(child: ClientContext): void {
      child.slots.inject('settings.general.item', () => child.slots.register({
        name: 'settings.general.item',
        id: 'acryl-blends-shortcuts',
        // After Developer tools (15), before the version (100).
        order: 50,
        inject: () => ({ shortcuts: child.shortcuts }),
      }, ShortcutsRow))
    },
  })

  // DSH's chat draws a slot before each completed turn's action row (`conversation.chat.turnTail`, declared by `@deepseek-ai/dsh-client-ui-chat`): the frame
  // puts its line there. It names the slot without that package's types, which the frame does not depend on.
  const turnTail = ctx.slots as unknown as {
    inject(name: string, register: () => unknown): void
    register(entry: object, component: unknown): unknown
  }
  turnTail.inject('conversation.chat.turnTail', () => turnTail.register({
    name: 'conversation.chat.turnTail',
    id: 'acryl-blends-saves',
    inject: (sessionId: string) => ({ sessionId, chatSaves }),
  }, TurnSaveFooter))

  ctx.inject(['sessions'], (child) => {
    child.effect(() => chats.watch(child.sessions), 'acryl-blends-frame: chats follow the sessions')
  })

  // The element picked in the canvas is what the chat is about (docs/design/blends-frame-mockup.html, scenario 2): its chip sits at the left of
  // the composer's input row, and the send gesture hands its page and selector to the frame's Host, which gives them to the agent as context for
  // that message; the person's message itself keeps exactly their words.
  ctx.plugin({
    name: 'acryl-blends-frame-element-selection',
    inject: ['slots', 'sessions'],
    apply(child: ClientContext): void {
      child.slots.inject('conversation.input.overlay', () => child.slots.register({
        name: 'conversation.input.overlay',
        id: 'element-selection',
        order: 10,
        inject: (sessionId): SelectionChipInjected => {
          const actx = child.sessions.scope(sessionId)
          const composer = (): SessionInput | undefined => {
            if (actx === undefined) return undefined
            return actx.get('conversation')?.input.for(actx)
          }
          return {
            selection: {
              get: () => selection.getSnapshot().selection,
              subscribe: listener => selection.subscribe(listener),
            },
            clear: () => { selection.clear() },
            focus: () => { composer()?.focus() },
            send: () => {
              const element = selection.getSnapshot().selection
              const input = composer()
              if (element === undefined || input === undefined) return
              if (!carriesSelection(input.state.getSnapshot().draft)) return
              // The pick belongs to this message, so the chip leaves either way. The post goes out in the same gesture, before the composer
              // sends, and nothing waits on it: the Host attaches the pick to that message's step (../selection-context.ts), and a hand-off that
              // fails costs the context, never the person's message.
              selection.clear()
              void handOffSelection((request, init) => fetch(request, init), sessionId, element)
            },
          }
        },
      }, SelectionChip))
    },
  })

  // The mockup's first run is the frame itself (docs/design/blends-frame-mockup.html, scenario 1): DSH's preview notice and credential prompt are
  // blocking modals over the app, so the frame keeps one pending step that renders nothing while the chat is blank. Setting up a model lives in
  // Settings > Models, where the frame's Settings has it; nothing blocks the app's first screen.
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'acryl-blends-first-run',
    order: -1000,
  }, NoOnboarding))

  ctx.effect(() => ctx.slots.register({
    name: 'root',
    children: {
      'main': { kind: 'keyed', scope: 'root' },
      'sidebar': { kind: 'single', scope: 'root' },
      'rightbar': { kind: 'single', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'shell.leading': { kind: 'single', scope: 'root' },
      // DSH's Settings modal and its launcher (`dsh-client-ui-settings-general`), drawn in the top bar.
      'sidebar.settings': { kind: 'single', scope: 'root' },
    },
    inject: () => ({
      layout,
      sidebar,
      canvas,
      selection,
      frameState,
      appReload,
      view,
      themeSwitch,
      chats,
      versions: {
        log: (path: string) => versionsApi.log(path),
        // Every version is a captured snapshot: a plugin folder without a row gets one, and the lock is written, before the commit. A capture
        // that fails does not stop the save (the version is then the files as they are), but it says why in the console.
        save: async (path: string, message: string) => {
          await snapshot.capture().catch((cause: unknown) => { console.warn(`acryl-blends-frame: the version was saved without a capture: ${cause instanceof Error ? cause.message : String(cause)}`) })
          return versionsApi.save(path, message)
        },
        // The files go back, the frame shows the new head, then the app page reloads on them (restore, state, canvas - in that order).
        restore: async (path: string, hash: string, message: string) => {
          const restored = await versionsApi.restore(path, hash, message)
          await frameState.refresh()
          canvas.reload()
          return restored
        },
        shared: (hashes: readonly string[]) => sharedVersionsApi.shared(hashes),
      },
      gitSync,
      tabs,
      tools,
      feedback,
      branchChats,
      switchRequests,
      ...(desktop === undefined ? {} : { desktop }),
      branches: {
        api: branchesApi,
        changed: () => frameState.refresh(),
        // The folder moves, the frame shows the new current branch, then the app page reloads on that branch's files.
        switchTo: async (name: string) => {
          await branchesApi.switchTo(name)
          await frameState.refresh()
          canvas.reload()
        },
      },
    }),
  }, BlendsFrame), 'acryl-blends-frame: root slot')
}
