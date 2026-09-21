import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { palettes } from '../../src/tui/palette.generated.ts'
import { fgRole, getPaletteMode, resolvePaletteMode, setPaletteMode, theme } from '../../src/tui/theme.ts'

const initial = getPaletteMode()
afterEach(() => { setPaletteMode(initial) })

describe('terminal palette (spec 038-ui-component-library, Q3 in research.md)', () => {
  it('the committed palette is what the token file compiles to (regenerate with scripts/compile-palette.mjs)', () => {
    const script = fileURLToPath(new URL('../../scripts/compile-palette.mjs', import.meta.url))
    expect(spawnSync(process.execPath, [script, '--check']).status).toBe(0)
  })

  it('the dark palette is exactly the palette the terminal shipped with before the token file existed', () => {
    expect(palettes.dark).toEqual({ primary: '#4F6BFE', secondary: '#38BDF8', accent: '#818CF8', reasoning: '#A855F7', success: '#34D399', warning: '#FBBF24', error: '#F87171', info: '#4F6BFE', muted: '#94A3B8' })
  })

  it('the light palette defines every role the dark one does', () => {
    expect(Object.keys(palettes.light)).toEqual(Object.keys(palettes.dark))
  })

  it('picks the palette from ACRYL_TUI_THEME first, then COLORFGBG, then dark', () => {
    expect(resolvePaletteMode({ ACRYL_TUI_THEME: 'light' })).toBe('light')
    expect(resolvePaletteMode({ ACRYL_TUI_THEME: 'DARK', COLORFGBG: '0;15' })).toBe('dark')
    expect(resolvePaletteMode({ COLORFGBG: '0;15' })).toBe('light')
    expect(resolvePaletteMode({ COLORFGBG: '15;0' })).toBe('dark')
    expect(resolvePaletteMode({ COLORFGBG: '15;default;7' })).toBe('light')
    expect(resolvePaletteMode({ COLORFGBG: 'garbage' })).toBe('dark')
    expect(resolvePaletteMode({ ACRYL_TUI_THEME: 'auto' })).toBe('dark')
    expect(resolvePaletteMode({})).toBe('dark')
  })

  it('a role color function and the theme object follow the live palette, so a captured function restyles', () => {
    const muted = fgRole('muted')   // captured once, like the 59 sites converted from import-time captures
    setPaletteMode('dark')
    const dark = muted('x')
    expect(theme.muted).toBe(palettes.dark.muted)
    setPaletteMode('light')
    expect(theme.muted).toBe(palettes.light.muted)
    expect(muted('x')).not.toBe(dark)
    expect(muted('x')).toBe('\x1b[38;2;100;116;139mx\x1b[0m')   // #64748B
  })
})
