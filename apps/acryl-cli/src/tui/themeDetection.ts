/**
 * Follow the terminal's own light/dark scheme (spec 038-ui-component-library, Q8 in research.md). pi-tui already implements the two mechanisms; this only wires them to
 * the palette: a one-time OSC 11 background query at startup (answered by most terminals within a few ms), then the terminal's live scheme notifications (DEC mode 2031) so
 * switching the terminal between light and dark restyles ACRYL without a restart. A terminal that answers neither leaves the palette on what `resolvePaletteMode` chose
 * (`ACRYL_TUI_THEME`, then `COLORFGBG`, then dark).
 * @module acryl-cli/tui/themeDetection
 */
import { getPaletteMode, isPaletteForced, setPaletteMode, type PaletteMode } from './theme.js'

/** The slice of pi-tui's `TUI` this needs, so it can be tested without a terminal. */
export interface ColorSchemeSource {
  /** pi-tui 1.x: the colors the terminal reports (OSC 10/11/4); a terminal that does not answer leaves them out. */
  queryTerminalColors(options: { timeoutMs: number }): Promise<{ readonly background?: { readonly r: number; readonly g: number; readonly b: number } }>
  onTerminalColorSchemeChange(listener: (scheme: PaletteMode) => void): () => void
  setTerminalColorSchemeNotifications(enabled: boolean): void
}

/**
 * Light or dark from a reported background (0-255 channels), by relative luminance (ITU-R BT.709 weights); `undefined`
 * when the terminal reported none.
 */
export function schemeOfBackground(background: { readonly r: number; readonly g: number; readonly b: number } | undefined): PaletteMode | undefined {
  if (background === undefined) return undefined
  const luminance = (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255
  return luminance >= 0.5 ? 'light' : 'dark'
}

/**
 * Ask the terminal for its scheme once and follow later changes.
 * @param onChange called after the palette actually changed, so the caller can re-render
 * @returns a disposer that stops following (and turns notifications off)
 */
export function followTerminalColorScheme(tui: ColorSchemeSource, onChange: () => void, env: Record<string, string | undefined> = process.env, timeoutMs = 250): () => void {
  if (isPaletteForced(env)) return () => {}
  let disposed = false
  const apply = (scheme: PaletteMode | undefined): void => {
    if (disposed || scheme === undefined || scheme === getPaletteMode()) return
    setPaletteMode(scheme)
    onChange()
  }
  const unsubscribe = tui.onTerminalColorSchemeChange(apply)
  tui.setTerminalColorSchemeNotifications(true)
  void tui.queryTerminalColors({ timeoutMs }).then(colors => { apply(schemeOfBackground(colors.background)) }, () => {})   // a terminal that never answers reports no background
  return () => {
    disposed = true
    unsubscribe()
    tui.setTerminalColorSchemeNotifications(false)
  }
}
