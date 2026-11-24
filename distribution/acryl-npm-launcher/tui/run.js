// Mount ACRYL Control Center on the real terminal and return what the person chose: `{ command, line }` for the `acryl` command to run after it closes
// (the terminal agent), or undefined when they quit. The apps it starts are its own processes and stop when it closes, as in the Control Center window.
// It runs in the regular screen (not the alternate one), so after it closes the scrollback shows where it was. The palette follows the terminal the way
// the ACRYL CLI does: ACRYL_TUI_THEME, then COLORFGBG, then the terminal's own report of its background and its later light/dark switches; NO_COLOR
// turns every color off.
import { spawn } from 'node:child_process'
import { ProcessTerminal, TuiMainScreen, matchesKey } from '@earendil-works/pi-tui'
import { keyProblem, saveModelKey } from '@acryldev/launcher'
import { createNodeLauncher, webboxesDeployUrl } from '@acryldev/launcher-desktop/node'
import { isPaletteForced, paletteModeFromEnv, paletteTheme, schemeOfBackground } from '@acryldev/ui-tui/scheme'
import { TICK_MS, colorEnabled } from './brand.js'
import { createControlCenterView } from './view.js'

// The list of apps, the model key and the registry are read and written by the same code the screen uses; the selector reaches them through this bundle.
export { addApp, addToApplications, blendVersionOf, isLauncherHome, modelEnv, offeredLauncher, readApps, recordOffer, refreshLaunchers, runAppsCommand, runModelCommand } from '@acryldev/launcher'
export { readBlends } from '@acryldev/launcher-desktop/node'

/** Open a URL in the browser or a folder in the file manager, without waiting and without failing the screen when there is no opener. */
export function openTarget(target, platform = process.platform) {
  const [command, args] = platform === 'darwin' ? ['open', [target]] : platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] : ['xdg-open', [target]]
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true })
    child.once('error', () => {})
    child.unref()
  } catch { /* no opener on this machine: the screen shows the address too */ }
}

/** `home` is ACRYL's own folder (~/.acryl); new apps are suggested beside it in ~/ACRYL. The selector decides the home, this face only passes it on. */
export function runLauncher({ env = process.env, terminal = new ProcessTerminal(), home, open = openTarget, version } = {}) {
  const tui = new TuiMainScreen(terminal)
  const color = colorEnabled(env, true)
  let mode = paletteModeFromEnv(env)
  const theme = { get mode() { return mode }, color: role => paletteTheme(mode).color(role) }
  const service = createNodeLauncher(home, () => env)
  void service.prepareTools()
  const disposers = []
  const restyle = next => {
    if (next === undefined || next === mode) return
    mode = next
    tui.requestRender(true)
  }

  return new Promise(resolve => {
    const view = createControlCenterView({
      version,
      service,
      model: { problem: (key, provider) => keyProblem(key, provider), save: (key, provider) => saveModelKey(home, key, provider) },
      deployUrl: webboxesDeployUrl,
      open,
      theme,
      color,
      rows: () => terminal.rows,
      requestRender: () => tui.requestRender(),
      finish: result => {
        for (const dispose of disposers.splice(0).reverse()) dispose()
        service.stopAll()
        tui.stop()
        resolve(result)
      },
    })
    tui.addChild(view)
    tui.setFocus(view)
    // In raw mode Ctrl-C is a key like any other: hand it to the view before anything else can swallow it.
    disposers.push(tui.addInputListener(data => {
      if (!matchesKey(data, 'ctrl+c')) return undefined
      view.handleInput(data)
      return { consume: true }
    }))
    const ticker = setInterval(() => view.tick(), TICK_MS)
    disposers.push(() => clearInterval(ticker))
    tui.start()
    if (!isPaletteForced(env)) {
      disposers.push(tui.onTerminalColorSchemeChange(restyle))
      tui.setTerminalColorSchemeNotifications(true)
      disposers.push(() => tui.setTerminalColorSchemeNotifications(false))
      void tui.queryTerminalColors({ timeoutMs: 250 }).then(colors => restyle(schemeOfBackground(colors.background)), () => {})
    }
  })
}
