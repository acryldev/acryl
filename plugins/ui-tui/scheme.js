// Light or dark: which palette a terminal gets, and the theme object the components take. The rules are the ACRYL CLI's
// (apps/acryl-cli/src/tui/theme.ts resolvePaletteMode and themeDetection.ts schemeOfBackground); spec 050 T008 moves the CLI onto this file.
import { palettes } from './palette.js'

const ESC = '\x1b'
const paint = hex => {
  const n = Number.parseInt(hex.slice(1), 16)
  return text => `${ESC}[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}${ESC}[0m`
}

/** The theme for a palette mode (`dark` or `light`), in the shape `createTuiUi` takes. */
export function paletteTheme(mode = 'dark') {
  const palette = palettes[mode] ?? palettes.dark
  return Object.freeze({ mode: palettes[mode] ? mode : 'dark', color: role => paint(palette[role] ?? palette.muted) })
}

/** True when the person chose a palette (`ACRYL_TUI_THEME`), so the terminal's own report is not followed. */
export const isPaletteForced = (env = process.env) => ['dark', 'light'].includes(env.ACRYL_TUI_THEME?.trim().toLowerCase() ?? '')

/** The palette before the terminal answers: `ACRYL_TUI_THEME`, then the background index in `COLORFGBG`, then dark. */
export function paletteModeFromEnv(env = process.env) {
  const forced = env.ACRYL_TUI_THEME?.trim().toLowerCase()
  if (forced === 'dark' || forced === 'light') return forced
  const background = env.COLORFGBG?.split(';').pop()
  if (background !== undefined && /^\d+$/u.test(background)) {
    const index = Number(background)
    return index === 7 || (index >= 9 && index <= 15) ? 'light' : 'dark'
  }
  return 'dark'
}

/** Light or dark from the background a terminal reports (0-255 channels), by relative luminance (ITU-R BT.709); undefined when none was reported. */
export function schemeOfBackground(background) {
  if (background === undefined) return undefined
  const luminance = (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255
  return luminance >= 0.5 ? 'light' : 'dark'
}
