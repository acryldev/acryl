/**
 * The desktop shell: `npm run desktop` opens the app in a window. A frame app (`scripts/ide-host.mjs`) gets the whole ACRYL frame: the window attaches to the
 * frame host that runs for this folder, or starts it as `npm run dev` does (`frame.ts`, docs/plans/ide-host-inversion.md section 27). An app made before the frame
 * starts its own server in this Electron main process and opens one window on its address. Nothing in the app imports electron; every Electron call of the app
 * is in this file and `window.ts`, so a different shell is a change here only.
 *
 * Order matters: the user-data folder is set before anything else (and before the single-instance lock), so one app never shares window state, logs or the lock with
 * another app or with the real user's data.
 */

import { mkdirSync, readFileSync, unwatchFile, watchFile } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readAppVersions } from '@acryldev/blends-core'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItem,
  screen,
  session,
  shell,
} from 'electron'
import '@acryldev/node-server/register'
import { type AppInstance, instanceEnv, selectInstance, withRunEnv } from '@acryldev/instance'
import { readProduct } from '@acryldev/instance/bundle'
import { appIdOf, osAppIdOf } from '@acryldev/instance/home'
import { type AppStorage, openProductStorage } from '@acryldev/instance/storage'
import { APP_PAGE_CHANNEL, appPageHandler } from './app-page.ts'
import { appRootFor } from './app-root.ts'
import { runningApp } from './attach.ts'
import { appTitle, iconFile } from './brand.ts'
import {
  type DesktopPort,
  type MenuItemPort,
  startDoorShell,
  type WindowPort,
} from './door-shell.ts'
import {
  type FrameHost,
  type HostEnd,
  hostAddress,
  isFrameApp,
  navigation,
  openFrameSettings,
  runningFrame,
  startFrameHost,
  withoutToken,
} from './frame.ts'
import { productGit, withGitFirst } from './git.ts'
import { appendHostLog, hostCrashed, hostRestarting, nextRestart } from './host-supervisor.ts'
import { aboutPlacement, aboutText, hasSettings, settingsPlacement } from './menu.ts'
import { isBlendCopy, openProductAppForStart, seedSource } from './product.ts'
import { createDesktopShutdown, installShutdownRequests } from './shutdown.ts'
import {
  COPY_DEADLINE_MS,
  captureConsole,
  createStartupLog,
  endsWithLastWindow,
  retryLocked,
  updateFailureText,
  updateWindowUrl,
  waitAtMost,
} from './startup.ts'
import { offerBlendUpdates, offerUpdates } from './update-menu.ts'
import { resolveDesktopUserDataOverride } from './user-data.ts'
import { cascade, windowOptions, windowSize } from './window.ts'

// The start's own log, from the first line: kept in memory until the product's logs folder is known (`startup.attach`), and everything the shell prints goes in it.
const startup = createStartupLog()
captureConsole(console, startup)
process.on('uncaughtExceptionMonitor', (cause, origin) => {
  startup.line(
    `error: ${origin}: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`,
  )
})
console.log(
  `desktop: starting ${app.getName()} ${app.getVersion()} (pid ${String(process.pid)}, ${process.platform} ${process.arch}, electron ${process.versions.electron ?? '?'})`,
)

/** The app shipped inside the bundle (a packaged product) or checked out by the person (an app made with `acrylblends init`); as an installed package, Electron names it. */
const bundledRoot = appRootFor(import.meta.url, () => app.getAppPath())
// A product build keeps its apps in its own root in the OS per-user data folder, one sealed folder each, and runs on the source of the one it opens: the
// bundle is the read-only Program (plugins/instance/storage.ts). An app made with `acrylblends init` runs on its own folder.
const product = app.isPackaged ? readProduct(bundledRoot) : undefined
/** The git the product ships beside the app (Resources/git), first on the frame host's PATH; the person's own git otherwise. */
const git = product === undefined ? undefined : productGit(process.resourcesPath, process.platform)
let storage: AppStorage | undefined
/** The app the window shows. A product can switch to another of its apps (Settings > App: import, start over, open). */
let chosen: AppInstance
/** The update's copy over the source, when this start is the first of a new build: run after the single-instance lock, behind a window. */
let update: (() => Promise<void>) | undefined
try {
  storage =
    product === undefined
      ? undefined
      : openProductStorage({
          writtenBy: app.getVersion(),
          // Products share ~/.acryl: ACRYL ADE once opened ACRYL Control Center's app and wrote its own build over it.
          product: { name: product.appName, named: product.named === true },
          ...(git === undefined ? {} : { git: git.executable }),
          reveal: (path) => {
            shell.showItemInFolder(path)
          },
        })
  if (storage === undefined || product === undefined) {
    chosen = selectInstance({ projectRoot: bundledRoot, env: process.env })
  } else {
    const started = openProductAppForStart(storage, product, bundledRoot)
    update = started.update
    chosen = withRunEnv(started.app, process.env)
  }
  // Beside the host's own log: the app's data/logs. What was said until now is written first.
  startup.attach(join(chosen.home, 'logs'))
} catch (cause) {
  // A root of a newer version, or one this version cannot read: said once, in a dialog, and nothing is started or written.
  const message = cause instanceof Error ? cause.message : String(cause)
  // The app is not known yet: the product's own logs folder. An app run from its own folder has no product storage: its start was in its
  // terminal, and the dialog below says the reason (where an app keeps anything is the AppInstance family's decision alone, bulkhead rule).
  if (storage !== undefined) startup.attach(join(dirname(storage.electron), 'logs'))
  console.error(`desktop: ${message}`)
  dialog.showErrorBox(`${product?.product ?? 'The app'} cannot open`, message)
  app.exit(1)
  throw cause
}
const projectRoot = chosen.root
/** Where the Program is: the bundle of a product (its apps' sources hold only the person's files), else the app folder itself. */
const programRoot = storage === undefined ? projectRoot : bundledRoot
/** The versions the About window shows: a packed app's own (Electron's stands in for it in an app run from its folder, so none then), its Blend's and the framework's. */
function ownVersions(): {
  readonly product?: string
  readonly blend?: string
  readonly framework?: string
} {
  return {
    ...(app.isPackaged ? { product: app.getVersion() } : {}),
    ...readAppVersions(chosen.root, programRoot),
  }
}
/** macOS's About panel: the version, then in parentheses the Blend's and the framework's. Again after an update, which changes them. */
/** A file's text, or undefined when it cannot be read. */
const readPackageText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

const applyAbout = (): void => {
  const own = ownVersions()
  app.setAboutPanelOptions({
    applicationVersion: own.product ?? own.blend ?? '',
    version: [
      own.product === undefined || own.blend === undefined ? undefined : `Blend ${own.blend}`,
      own.framework === undefined ? undefined : `ACRYL Blends ${own.framework}`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' · '),
    ...(git === undefined
      ? {}
      : {
          credits:
            'Includes Git, free software under the GNU GPL version 2. Its licence and the offer of its source are in Settings > App.',
        }),
  })
}
applyAbout()

/** Where the window opens: `acrylblends.desktopPath` in package.json (the todo template sets `/todo`), else the root. */
function startPath(): string {
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
    acrylblends?: { desktopPath?: string }
  }
  return manifest.acrylblends?.desktopPath ?? '/'
}

/** Electron's user-data folder: an explicit DSH_DESKTOP_USER_DATA, else the product's own (beside its apps), else a folder inside the app's own home. */
// One folder per product: Electron lets one process own a user-data folder, so a shared one made ACRYL ADE quit as a second ACRYL Control Center.
const userData =
  resolveDesktopUserDataOverride(process.env) ??
  (storage === undefined || product === undefined
    ? join(chosen.home, 'electron')
    : join(storage.electron, product.appName))
mkdirSync(userData, { recursive: true, mode: 0o700 })
app.setPath('userData', userData)
// A packed product is named by its marker (the menu's About and Quit, the Dock): its source's package is named after the folder it was packed from.
app.setName(product?.product ?? appTitle(projectRoot))
// Windows groups and pins a window under the shortcut that carries the same AppUserModelID (spec 052 T057): the Start entry `Add to Applications` wrote
// carries the app's own id. A packed product keeps the id its installer gave it.
// Linux: a dock or app menu matches a window to its .desktop entry by the window class (StartupWMClass, spec 052 T058). Under Electron 44 only the desktop
// name sets it (measured on Ubuntu with xprop: app.setName and --class leave "electron"); the class is then the name without ".desktop".
if (product === undefined) {
  const osId = osAppIdOf(appIdOf(projectRoot))
  if (process.platform === 'win32') app.setAppUserModelId(osId)
  if (process.platform === 'linux') app.setDesktopName(`${osId}.desktop`)
}

if (!app.requestSingleInstanceLock()) {
  // The same app is already open, or starting, or updating: it is told (`second-instance` below shows its window, or queues that until it has one) and this process ends.
  console.log('desktop: the app is already running: asking it to show its window; this start ends')
  app.quit()
} else {
  /** The app the window shows: what the app's own `src/app.ts` returns (`createApp`). */
  let running: { readonly url: string; stop(): Promise<void> } | undefined
  let host: FrameHost | undefined
  let window: BrowserWindow | undefined
  let stopDoorShell: (() => void) | undefined
  /** The small window shown while the update copies, and whether it does; the app's own window does not exist yet then. */
  let updateWindow: BrowserWindow | undefined
  /** A second start came before any window was open: the window is brought forward as soon as there is one. */
  let focusQueued = false

  const shutdown = createDesktopShutdown(
    async () => {
      stopDoorShell?.()
      await running?.stop()
      // The frame host this window started (never one it attached to) goes with the window, with every terminal it runs.
      await host?.stop()
      // What the window stored is written now: the process may end at `quit`, before Chromium's own late teardown would write it.
      session.defaultSession.flushStorageData()
      await session.defaultSession.cookies.flushStore()
    },
    (code) => {
      // Electron emits `quit` as its last step and then ends its message loop; on macOS that loop sometimes keeps running with nothing left (no
      // window, no helper process, every disposer done), about one SIGTERM in six for ACRYL ADE, so the process stayed up forever. It ends here
      // instead. process.exit in Electron's main process goes back into app.exit, which is already under way; reallyExit is Node's plain exit.
      app.once('quit', () => {
        ;(process as NodeJS.Process & { reallyExit(code: number): never }).reallyExit(code)
      })
      app.exit(code)
    },
  )
  installShutdownRequests(process, app, (code) => {
    void shutdown.request(code)
  })

  app.on('second-instance', () => {
    const shown = window ?? updateWindow
    if (shown === undefined || shown.isDestroyed()) {
      // Nothing to show yet (the update, or the host, is still starting): a silent return here made a second double-click look like a start that did nothing.
      console.log(
        'desktop: a second start asked for the window; none is open yet, so its focus is queued',
      )
      focusQueued = true
      return
    }
    console.log('desktop: a second start asked for the window; bringing it forward')
    if (shown.isMinimized()) shown.restore()
    shown.focus()
  })
  // The window is the app: closing it ends the process on every platform, after the server has stopped.
  app.on('window-all-closed', () => {
    // Closing the update's own window (before the app's exists) must not end the app: found on a walk of the update on Windows, where the start ended there.
    if (!endsWithLastWindow(window !== undefined)) return
    void shutdown.request(0)
  })

  const started = app.whenReady().then(async () => {
    if (update !== undefined && product !== undefined) {
      // The first start of a new build copies it over the app's source: behind a window that says so (a copy can take many seconds on a slow disk), after the
      // lock (so a second start never copies at the same time), and a file another program holds is tried again and then said in words, never an exit with nothing shown.
      const copying = update
      const shown = new BrowserWindow({
        width: 420,
        height: 180,
        title: product.product,
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        autoHideMenuBar: true,
        icon: iconFile(projectRoot),
      })
      updateWindow = shown
      shown.removeMenu()
      shown.once('ready-to-show', () => {
        shown.show()
        if (focusQueued) shown.focus()
      })
      void shown.loadURL(updateWindowUrl(product.product))
      try {
        await waitAtMost(
          retryLocked(
            () =>
              copying().catch((cause: unknown) => {
                console.warn(
                  `desktop: the update's copy stopped: ${cause instanceof Error ? cause.message : String(cause)}`,
                )
                throw cause
              }),
            { attempts: 3, delayMs: 2000 },
          ),
          COPY_DEADLINE_MS,
        )
        console.log('desktop: the update was copied')
        applyAbout()
      } catch (cause) {
        console.error(
          `desktop: the update could not be copied: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`,
        )
        const said = updateFailureText(product.product, cause, join(chosen.home, 'logs'))
        await dialog.showMessageBox({
          type: 'warning',
          title: product.product,
          message: said.message,
          detail: said.detail,
          buttons: ['Start'],
          defaultId: 0,
        })
      } finally {
        if (!shown.isDestroyed()) shown.destroy()
        updateWindow = undefined
      }
    }
    // The Dock shows the app's own icon even when the bundle could not be branded (brand.ts); a no-op where there is no Dock.
    app.dock?.setIcon(iconFile(projectRoot))
    // An icon chosen in Settings > App (written to assets/icon.png by the frame's host) shows at once, in the Dock and on every window.
    const ownIcon = join(projectRoot, 'assets', 'icon.png')
    watchFile(ownIcon, { interval: 1000 }, () => {
      const icon = iconFile(projectRoot)
      app.dock?.setIcon(icon)
      for (const open of BrowserWindow.getAllWindows()) if (!open.isDestroyed()) open.setIcon(icon)
    })
    app.on('will-quit', () => {
      unwatchFile(ownIcon)
    })
    // The hook above is registered before the app's modules are loaded, so the app may have .tsx pages: they are loaded here, not as a static import.
    // A dev server is already running from this folder (`npm run dev`): the door allows one process per folder, so the window opens on that server instead of starting a second one,
    // and closing the window leaves it running.
    const frame = isFrameApp(programRoot)
    const attached = frame ? undefined : await runningApp(projectRoot)
    let url: string
    /** This window's own frame host on the chosen app; its address once it serves. */
    const startHost = (): Promise<string> => {
      // The host chooses the same home and port as this window: decided here once, never again from the folder it runs in. The product's git comes first
      // on its PATH, so everything the host starts finds it by name.
      const env = { ...process.env, ...instanceEnv(chosen) }
      const logs = join(chosen.home, 'logs')
      const started = startFrameHost(
        chosen.root,
        git === undefined ? env : withGitFirst(env, git, process.platform),
        (text) => {
          // Kept on disk too: a packaged app has no terminal, and a host that stops must leave its reason.
          appendHostLog(logs, text)
          process.stdout.write(text)
          // The watcher that runs the host stays alive when the host crashes (it waits for a saved file): that line is the death.
          recent = (recent + text).slice(-3000)
          // The watcher brought the host back as a new process: the windows sign in to it again, or every call they make answers 401.
          if (serving && hostRestarting(text)) restarting = true
          const again = restarting ? hostAddress(text) : undefined
          if (again !== undefined) {
            restarting = false
            for (const shown of BrowserWindow.getAllWindows())
              if (!shown.isDestroyed())
                shown.loadURL(again).catch((cause: unknown) => {
                  console.warn(
                    `desktop: the window could not load the restarted host: ${cause instanceof Error ? cause.message : String(cause)}`,
                  )
                })
          }
          if (serving && hostCrashed(text))
            void started.stop().then(() => recover(started, crashedEnd(recent)))
        },
        process.platform,
        // A packaged product carries no npm: its host runs on this app's own Electron runtime.
        app.isPackaged ? { runtime: process.execPath, program: programRoot } : {},
      )
      host = started
      let serving = false
      let recent = ''
      let restarting = false
      // Watched once it serves: a host that ends before that fails the start itself (the caller quits with the reason).
      return started.ready.then((address) => {
        serving = true
        void started.ended.then((end) => recover(started, end))
        return address
      })
    }
    const crashedEnd = (text: string): HostEnd => ({
      code: null,
      signal: null,
      tail: text,
      requested: false,
    })
    /** When the host stopped by itself (it did not die with the window or a switch of app): the times, so a host that keeps stopping is given up on. */
    const stops: number[] = []
    /** The host this window started ended without being asked to: start it again and show it in every window, or say why not. */
    const recover = async (first: FrameHost, end: HostEnd): Promise<void> => {
      if (end.requested || host !== first) return
      /** The host this loop is answering for: the one that stopped, then each attempt that did not serve. A switch of app replaces `host`, and then it is not ours any more. */
      let ours = first
      const logs = join(chosen.home, 'logs')
      let last = end
      for (;;) {
        const exit = last.signal ?? `code ${String(last.code)}`
        appendHostLog(logs, `\n[desktop] the frame host ended by itself (${exit})\n`)
        console.error(`desktop: the frame host ended by itself (${exit}); ${last.tail.slice(-400)}`)
        const decision = nextRestart(stops, Date.now())
        if (!decision.restart) {
          const answer = await dialog.showMessageBox({
            type: 'error',
            message: `${chosen.name} keeps stopping`,
            detail: `Its engine stopped by itself ${String(stops.length)} times in two minutes (${exit}).\n\nLast output:\n${last.tail.slice(-600)}\n\nThe whole output is in ${logs}`,
            buttons: ['Try again', 'Quit'],
            defaultId: 0,
            cancelId: 1,
          })
          if (answer.response !== 0) {
            await shutdown.request(1)
            return
          }
          stops.length = 0
          continue
        }
        stops.push(Date.now())
        await new Promise((done) => setTimeout(done, decision.delayMs))
        if (host !== ours) return
        try {
          url = await startHost()
        } catch (cause) {
          if (host !== undefined) ours = host
          // It ended before it served: that is another stop, with the reason it gave.
          last = {
            code: null,
            signal: null,
            tail: cause instanceof Error ? cause.message : String(cause),
            requested: false,
          }
          continue
        }
        origin = new URL(url).origin
        for (const shown of live())
          shown.loadURL(url).catch((cause: unknown) => {
            console.warn(
              `desktop: the window could not load the restarted app: ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          })
        console.log(`desktop: the frame host was started again at ${origin}`)
        return
      }
    }
    if (frame) {
      // The frame that already runs for this folder (`npm run dev`, or another window's host), else a host of this window's own.
      const runningAddress = await runningFrame(chosen.home)
      if (runningAddress !== undefined) {
        console.log(
          `desktop: attached to the frame already running from this folder at ${new URL(runningAddress).origin} (it keeps running when the window closes)`,
        )
        url = runningAddress
      } else {
        try {
          url = await startHost()
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause)
          console.error(`desktop: ${reason}`)
          // A start that ends with nothing on screen looks like an app that does not open: the reason is shown, and where the logs are.
          dialog.showErrorBox(
            `${chosen.name} cannot start`,
            `${reason.slice(-1200)}\n\nThe details are in ${join(chosen.home, 'logs')}`,
          )
          await shutdown.request(1)
          return
        }
        console.log(
          `desktop: the frame host serves ${new URL(url).origin}; closing the window stops it`,
        )
      }
    } else if (attached !== undefined) {
      console.log(
        `desktop: attached to the app already running from this folder at ${attached.url} (its server keeps running when the window closes)`,
      )
      url = attached.url
    } else {
      const { createApp } = (await import(
        pathToFileURL(join(chosen.root, 'src', 'app.ts')).href
      )) as {
        createApp: (chosen: unknown) => Promise<{ readonly url: string; stop(): Promise<void> }>
      }
      running = await createApp(chosen)
      url = running.url
    }
    // Both change when a product switches to another of its apps (each app has its own port); the handlers below read them when they run.
    let origin = new URL(url).origin
    /** Where a window opens: the frame's address (with its token) for a frame app, else a path of the app (`acrylblends.desktopPath`, else the root). */
    const addressOf = (path: string | undefined): string =>
      frame && path === undefined ? url : new URL(path ?? startPath(), url).href
    /** One window on an address of the app. Navigation follows `navigation` in frame.ts. The user agent names the window to the door (`AcrylWindow/<id>`), so an agent can drive it with `--window <id>`. */
    // Where each window was opened: `window list` shows it until the page reports its own address (Electron gives none while the first load has not started).
    const openedOn = new Map<number, string>()
    /** The App pages are a product's, on a frame host this window started: a host it attached to belongs to another process. */
    const appPage = storage !== undefined && frame && host !== undefined
    const createWindow = (path: string | undefined): BrowserWindow => {
      // A window opened while another is open sits a step down and to the right of it, not exactly on top.
      const beside =
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows().find((other) => !other.isDestroyed())
      const work = (
        beside === undefined
          ? screen.getPrimaryDisplay()
          : screen.getDisplayMatching(beside.getBounds())
      ).workArea
      const size = windowSize(work)
      const where = (() => {
        if (beside === undefined) return {}
        const bounds = beside.getBounds()
        // The places of the windows that are open: a new window never goes exactly where one already is.
        const taken = BrowserWindow.getAllWindows()
          .filter((other) => !other.isDestroyed())
          .map((other) => other.getPosition())
          .map(([x = 0, y = 0]) => ({ x, y }))
        return cascade(bounds, work, size, taken)
      })()
      const created = new BrowserWindow(
        windowOptions({
          title: chosen.name,
          ...size,
          ...where,
          icon: iconFile(projectRoot),
          // A product's window page gets the bridge of its App pages (Settings > App, Name your app).
          ...(appPage ? { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) } : {}),
        }),
      )
      const address = addressOf(path)
      openedOn.set(created.id, new URL(address).pathname)
      created.webContents.setUserAgent(
        `${created.webContents.getUserAgent()} AcrylWindow/${String(created.id)}`,
      )
      // The window is named for the app it shows (its name, and a new one after a rename), not for the page's own `<title>`: the frame's page says "ACRYL".
      created.on('page-title-updated', (event) => {
        event.preventDefault()
        created.setTitle(chosen.name)
      })
      created.once('ready-to-show', () => created.show())
      // A new window of the page never opens inside the app: an http(s) or mailto address goes to the system browser, anything else nowhere.
      created.webContents.setWindowOpenHandler(({ url: target }) => {
        if (navigation(target, '') === 'external') void shell.openExternal(target)
        return { action: 'deny' }
      })
      // Only the main frame is checked, so the frame's tiles (the app's page in an iframe) navigate freely; the window itself stays on the app's origin.
      created.webContents.on('will-frame-navigate', (event) => {
        const decision = navigation(event.url, origin, event.isMainFrame)
        if (decision === 'stay') return
        event.preventDefault()
        if (decision === 'external') void shell.openExternal(event.url)
      })
      created.webContents.on('will-redirect', (event, target, _inPlace, isMainFrame) => {
        if (navigation(target, origin, isMainFrame) !== 'stay') event.preventDefault()
      })
      created.loadURL(address).catch((cause: unknown) => {
        console.warn(
          `desktop: the window could not load ${new URL(address).pathname}: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      })
      return created
    }
    window = createWindow(frame ? undefined : startPath())
    if (focusQueued) {
      focusQueued = false
      window.once('ready-to-show', () => window?.focus())
    }
    // The door (development) reaches the windows and the menu through this port: `acryl window list`, `acryl menu click`.
    const live = (): BrowserWindow[] =>
      BrowserWindow.getAllWindows().filter((candidate) => !candidate.isDestroyed())
    const port = (candidate: BrowserWindow): WindowPort => ({
      id: candidate.id,
      getTitle: () => candidate.getTitle(),
      // Without the frame's launch token: the door prints this address and its audit keeps it.
      getURL: () =>
        withoutToken(
          candidate.webContents.getURL() || new URL(openedOn.get(candidate.id) ?? '/', url).href,
        ),
      isFocused: () => candidate.isFocused(),
      isMinimized: () => candidate.isMinimized(),
      getSize: () => candidate.getSize(),
      getPosition: () => candidate.getPosition(),
      restore: () => candidate.restore(),
      focus: () => candidate.focus(),
      close: () => candidate.close(),
      setSize: (width, height) => candidate.setSize(width, height),
    })
    // Pressing an item as Electron's own menu does: with the window that has focus (the roles reload, zoom and close act on it).
    const menuItem = (item: MenuItem): MenuItemPort => ({
      label: item.label,
      enabled: item.enabled,
      visible: item.visible,
      type: item.type,
      role: item.role,
      // Electron gives a plain item `submenu: null` on Linux and `undefined` elsewhere.
      submenu: item.submenu ? { items: item.submenu.items.map(menuItem) } : null,
      click: () => {
        const target = BrowserWindow.getFocusedWindow() ?? live()[0]
        item.click(undefined, target, target?.webContents)
      },
    })
    const desktop: DesktopPort = {
      windows: () => live().map(port),
      open: (path) => port(createWindow(path ?? (frame ? undefined : startPath()))),
      menu: () => (Menu.getApplicationMenu()?.items ?? []).map(menuItem),
    }
    // An app that serves a /settings page gets a Settings item in the menu (Electron's own menu otherwise): it opens that page, in the window that already shows it when there is one.
    // A frame window's item opens the frame's own Settings (the dialog the left panel's button opens), in the window that has focus.
    const settingsServed = frame
      ? true
      : await fetch(new URL('/settings', url), {
          headers: { accept: 'text/html' },
          signal: AbortSignal.timeout(2000),
        }).then(
          (answer) => answer.ok,
          () => false,
        )
    const menu = Menu.getApplicationMenu()
    const placement =
      menu === null || !settingsServed || hasSettings(menu.items)
        ? undefined
        : settingsPlacement(menu.items, process.platform)
    if (menu !== null && placement !== undefined) {
      const target = menu.items[placement.menu]?.submenu
      const openSettings = (): void => {
        if (frame) {
          const target = BrowserWindow.getFocusedWindow() ?? live()[0]
          if (target === undefined) return
          if (target.isMinimized()) target.restore()
          target.focus()
          target.webContents.executeJavaScript(openFrameSettings).catch((cause: unknown) => {
            console.warn(
              `desktop: Settings could not be opened in the frame: ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          })
          return
        }
        const shown = live().find(
          (candidate) =>
            new URL(candidate.webContents.getURL() || 'about:blank', url).pathname === '/settings',
        )
        if (shown === undefined) createWindow('/settings')
        else {
          if (shown.isMinimized()) shown.restore()
          shown.focus()
        }
      }
      target?.insert(
        placement.at,
        new MenuItem({ label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: openSettings }),
      )
      if (placement.separatorAfter)
        target?.insert(placement.at + 1, new MenuItem({ type: 'separator' }))
      Menu.setApplicationMenu(menu)
    }
    if (product?.releases !== undefined)
      offerUpdates(product.releases, () => live()[0], join(userData, 'updates'))
    else if (isBlendCopy(readPackageText(join(projectRoot, 'package.json'))))
      offerBlendUpdates(() => BrowserWindow.getFocusedWindow() ?? live()[0])
    // Windows and Linux: Help > About <name> shows the version (macOS has the About panel).
    const helpMenu = Menu.getApplicationMenu()
    const aboutAt = helpMenu === null ? undefined : aboutPlacement(helpMenu.items, process.platform)
    if (helpMenu !== null && aboutAt !== undefined) {
      helpMenu.items[aboutAt]?.submenu?.append(
        new MenuItem({
          label: `About ${app.getName()}`,
          click: () => {
            const about = aboutText(app.getName(), ownVersions(), process.versions)
            const owner = BrowserWindow.getFocusedWindow() ?? live()[0]
            const options = { type: 'info' as const, buttons: ['OK'], ...about }
            if (owner === undefined) void dialog.showMessageBox(options)
            else void dialog.showMessageBox(owner, options)
          },
        }),
      )
      Menu.setApplicationMenu(helpMenu)
    }
    stopDoorShell = startDoorShell(chosen.root, { desktop, log: console.log })

    if (appPage && storage !== undefined && product !== undefined) {
      const productStorage = storage
      /** Stop the host, run `next`, start the host on the app it returns and show it in every window; the app that ran comes back when `next` fails. */
      const switchTo = async (next: () => AppInstance): Promise<void> => {
        const previous = chosen
        await host?.stop()
        host = undefined
        let failure: unknown
        try {
          chosen = withRunEnv(next(), process.env)
        } catch (cause) {
          failure = cause
          chosen = previous
        }
        try {
          url = await startHost()
        } catch (cause) {
          console.error(`desktop: ${cause instanceof Error ? cause.message : String(cause)}`)
          if (chosen === previous) {
            await shutdown.request(1)
            return
          }
          // The new app does not start: the one that ran comes back, if its folders are still there.
          failure = cause
          chosen = previous
          url = await startHost()
        }
        origin = new URL(url).origin
        app.setName(chosen.name)
        stopDoorShell?.()
        stopDoorShell = startDoorShell(chosen.root, { desktop, log: console.log })
        for (const shown of live())
          shown.loadURL(url).catch((cause: unknown) => {
            console.warn(
              `desktop: the window could not load the app: ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          })
        console.log(`desktop: now showing the app "${chosen.name}" (${chosen.id}) at ${origin}`)
        if (failure !== undefined) throw failure
      }
      const dialogParent = (): BrowserWindow | undefined =>
        BrowserWindow.getFocusedWindow() ?? live()[0]
      const archiveFilter = [{ name: 'ACRYL Blends app', extensions: ['acrylblend'] }]
      const handle = appPageHandler({
        storage: productStorage,
        current: () => chosen.id,
        seed: (source) => {
          seedSource(bundledRoot, source, product.program)
        },
        switchTo,
        chooseExportFile: async (suggested) => {
          const parent = dialogParent()
          const options = { defaultPath: suggested, filters: archiveFilter }
          const answer = await (parent === undefined
            ? dialog.showSaveDialog(options)
            : dialog.showSaveDialog(parent, options))
          return answer.canceled || answer.filePath === undefined || answer.filePath === ''
            ? undefined
            : answer.filePath
        },
        chooseImportFile: async () => {
          const parent = dialogParent()
          const options = { filters: archiveFilter, properties: ['openFile' as const] }
          const answer = await (parent === undefined
            ? dialog.showOpenDialog(options)
            : dialog.showOpenDialog(parent, options))
          return answer.canceled ? undefined : answer.filePaths[0]
        },
        openPath: async (path) => {
          const problem = await shell.openPath(path)
          if (problem !== '') throw new Error(problem)
        },
        renamed: (renamed) => {
          chosen = Object.freeze({ ...chosen, name: renamed.name })
          app.setName(renamed.name)
          for (const open of BrowserWindow.getAllWindows())
            if (!open.isDestroyed()) open.setTitle(renamed.name)
        },
        platform: process.platform,
        ...(git === undefined ? {} : { git }),
      })
      ipcMain.handle(APP_PAGE_CHANNEL, (event, op: unknown, arg: unknown) => {
        // Only the window's own page on the frame's origin: never the app's iframe, never a page the window was sent to.
        const sender = event.senderFrame
        if (
          sender === null ||
          sender !== event.sender.mainFrame ||
          new URL(sender.url).origin !== origin
        )
          return { ok: false, message: 'only the frame page can ask this' }
        return handle(op, arg)
      })
    }
  })
  // Anything the start throws after the window machinery is up: said in a dialog and kept in the log, then the app ends (it cannot run half started).
  started.catch((cause: unknown) => {
    const reason = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    console.error(`desktop: the start failed: ${reason}`)
    dialog.showErrorBox(`${product?.product ?? 'The app'} cannot start`, reason.slice(0, 1500))
    void shutdown.request(1)
  })
}
