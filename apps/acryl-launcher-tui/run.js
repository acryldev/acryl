// Mount the launcher view on the real terminal and return what the person chose: `{ command, line }` to run, or undefined when they quit.
// It runs in the regular screen (not the alternate one), so after it closes the scrollback shows what was chosen.
// The palette follows the terminal the way the ACRYL CLI does: ACRYL_TUI_THEME, then COLORFGBG, then the terminal's own report of its
// background and its later light/dark switches.
import { ProcessTerminal, TuiMainScreen, matchesKey } from '@earendil-works/pi-tui'
import { nodeContext } from 'acryl-launcher/node'
import { isPaletteForced, paletteModeFromEnv, paletteTheme, schemeOfBackground } from 'acryl-ui-tui/scheme'
import { createLauncherView } from './view.js'

export function runLauncher({ cwd = process.cwd(), env = process.env, terminal = new ProcessTerminal() } = {}) {
  const tui = new TuiMainScreen(terminal)
  let mode = paletteModeFromEnv(env)
  const theme = { get mode() { return mode }, color: role => paletteTheme(mode).color(role) }
  const disposers = []
  const restyle = next => {
    if (next === undefined || next === mode) return
    mode = next
    tui.requestRender(true)
  }

  return new Promise(resolve => {
    const view = createLauncherView({
      context: nodeContext(cwd),
      theme,
      requestRender: () => tui.requestRender(),
      finish: result => {
        for (const dispose of disposers.splice(0).reverse()) dispose()
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
    tui.start()
    if (!isPaletteForced(env)) {
      disposers.push(tui.onTerminalColorSchemeChange(restyle))
      tui.setTerminalColorSchemeNotifications(true)
      disposers.push(() => tui.setTerminalColorSchemeNotifications(false))
      void tui.queryTerminalColors({ timeoutMs: 250 }).then(colors => restyle(schemeOfBackground(colors.background)), () => {})
    }
  })
}
