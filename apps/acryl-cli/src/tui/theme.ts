/**
 * DeepSeek brand palette for the TUI. Keep color decisions semantic so every
 * Ink surface and the raw-ANSI `render.ts`/`bannerText.ts` helpers share the
 * same visual language — see `DESIGN.md` for the full rationale and the
 * component-mapping guide this table is drawn from.
 *
 * The terminal still owns its background and default foreground; these are
 * foreground tokens for interactive, stateful, and brand elements only —
 * this TUI renders to native scrollback (no painted panel backgrounds), so
 * DeepSeek's `surface`/`bg-dark`/`border-dim` tokens are deliberately not
 * represented here.
 * The hex values are generated from the UI library's semantic role file (`plugins/acryl-ui/contracts/tokens.json`, spec 038-ui-component-library) into
 * `palette.generated.ts`; a light-background palette exists for the same nine roles.
 * @module @tomowang/dsh-tui/tui/theme
 */

import { palettes, type PaletteMode, type Role } from './palette.generated.js'

export type { PaletteMode, Role }

let mode: PaletteMode = 'dark'

/**
 * Decide the palette for a terminal: `ACRYL_TUI_THEME=dark|light` wins; otherwise `COLORFGBG` (`fg;bg`, set by many terminals, a background index of 0-6 or 8
 * is dark and 7 or 9-15 is light); otherwise dark. Asking the terminal itself (OSC 11) is not done: it needs terminal I/O with a timeout, and the two
 * settings above cover the cases that matter without touching the input stream.
 */
export function resolvePaletteMode(env: Record<string, string | undefined> = process.env): PaletteMode {
  const forced = env.ACRYL_TUI_THEME?.trim().toLowerCase()
  if (forced === 'dark' || forced === 'light') return forced
  const background = env.COLORFGBG?.split(';').pop()
  if (background !== undefined && /^\d+$/u.test(background)) {
    const index = Number(background)
    return index === 7 || (index >= 9 && index <= 15) ? 'light' : 'dark'
  }
  return 'dark'
}

const listeners = new Set<(next: PaletteMode) => void>()

/** Switch the live palette. Everything that reads `theme` or a `fgRole` function afterwards uses it; listeners (the TUI's re-render, plugins through the tuiTheme service) are told once per real change. */
export function setPaletteMode(next: PaletteMode): void {
  if (next === mode) return
  mode = next
  for (const listener of [...listeners]) listener(next)
}

/** Subscribe to palette changes. @returns the unsubscribe function. */
export function onPaletteChange(listener: (next: PaletteMode) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** True when the user pinned the palette (`ACRYL_TUI_THEME=dark|light`): the terminal is then never asked and never followed. */
export function isPaletteForced(env: Record<string, string | undefined> = process.env): boolean {
  const forced = env.ACRYL_TUI_THEME?.trim().toLowerCase()
  return forced === 'dark' || forced === 'light'
}

export function getPaletteMode(): PaletteMode {
  return mode
}

mode = resolvePaletteMode()

/**
 * The live palette. Read at the moment of use (each property is a getter), so switching the mode restyles code that reads `theme.<role>` inside a render
 * function. Code that captured a color once at import time (`const dim = fg(theme.muted)`) froze it, which is why those sites use `fgRole('muted')`
 * instead: a function that looks the color up on every call.
 */
export const theme: { readonly [R in Role]: string } = Object.defineProperties({}, Object.fromEntries(
  (Object.keys(palettes.dark) as Role[]).map(role => [role, { enumerable: true, get: () => palettes[mode][role] }]),
)) as { readonly [R in Role]: string }

/** 24-bit-color ANSI wrapper, shared by every raw-ANSI formatter (`render.ts`, `markdown.ts`, `bannerText.ts`) and every pi-tui component theme adapter. */
export function fg(hex: string): (s: string) => string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
}

/** A color function for a semantic role that follows the live palette (see `theme`). */
export function fgRole(role: Role): (s: string) => string {
  return (s: string) => fg(palettes[mode][role])(s)
}
