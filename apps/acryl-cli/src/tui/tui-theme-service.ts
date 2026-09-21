/**
 * The terminal palette as a Cordis service, so a plugin can read it and follow it: `ctx.get('tuiTheme')` in a plugin's `apply` (undefined outside the CLI). Same design as
 * `tuiCommands`: the CLI owns the palette (it is generated from the shared semantic role file), a plugin borrows it instead of carrying its own, and its colors change with the
 * terminal. Read-only for plugins by design: the mode is the user's (`ACRYL_TUI_THEME`) or the terminal's, never a plugin's.
 * @module acryl-cli/tui/tui-theme-service
 */
import { type Context, Service } from '@deepseek-ai/cordis'
import { fgRole, getPaletteMode, onPaletteChange, type PaletteMode, type Role } from './theme.js'
import { palettes } from './palette.generated.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tuiTheme: TuiThemeService
  }
}

export class TuiThemeService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tuiTheme')
  }

  /** `dark` or `light`: the palette in use right now. */
  get mode(): PaletteMode {
    return getPaletteMode()
  }

  /** The hex color of a role in the current palette (for code that builds its own escapes). */
  hex(role: Role): string {
    return palettes[getPaletteMode()][role]
  }

  /** A color function for a role that follows the live palette: capture it once, it restyles by itself. */
  color(role: Role): (text: string) => string {
    return fgRole(role)
  }

  /** Called after every palette change. Wrap the returned disposer in `ctx.effect` so it is removed with the plugin. */
  onChange(listener: (mode: PaletteMode) => void): () => void {
    return onPaletteChange(listener)
  }
}
