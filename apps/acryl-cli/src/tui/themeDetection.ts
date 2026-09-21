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
  queryTerminalColorScheme(options: { timeoutMs: number }): Promise<PaletteMode | undefined>
  onTerminalColorSchemeChange(listener: (scheme: PaletteMode) => void): () => void
  setTerminalColorSchemeNotifications(enabled: boolean): void
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
  void tui.queryTerminalColorScheme({ timeoutMs }).then(apply, () => {})   // a terminal that never answers resolves to undefined after the timeout
  return () => {
    disposed = true
    unsubscribe()
    tui.setTerminalColorSchemeNotifications(false)
  }
}
