/**
 * The top bar's Dark/Light switch. DSH's theme service owns the preference (light, dark or system, saved in the user's settings and following the OS
 * while it is `system`); this reads the colour scheme it resolved and flips it with `setTheme`, so the button, Settings > General > Appearance and the
 * OS all drive the same one value. Nothing here touches the DOM: the theme presenter paints the body, and the frame's styles follow it.
 */

export type ColorScheme = 'light' | 'dark'

/** The part of DSH's theme service this reads. */
export interface ThemeSource {
  getTheme(): { readonly active: { readonly colorScheme: ColorScheme } }
  setTheme(id: string): void
}

export class ThemeSwitch {
  private scheme: ColorScheme
  private readonly listeners = new Set<() => void>()

  constructor(private readonly theme: ThemeSource) {
    this.scheme = theme.getTheme().active.colorScheme
  }

  getSnapshot = (): ColorScheme => this.scheme

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Reads the scheme again after the theme service said it changed. */
  refresh(): void {
    const next = this.theme.getTheme().active.colorScheme
    if (next === this.scheme) return
    this.scheme = next
    for (const listener of this.listeners) listener()
  }

  /** Switches to the other scheme and keeps it (an explicit choice replaces `system`). */
  toggle(): void {
    this.theme.setTheme(this.scheme === 'dark' ? 'light' : 'dark')
  }
}
