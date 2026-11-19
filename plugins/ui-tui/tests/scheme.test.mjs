import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPaletteForced, paletteModeFromEnv, paletteTheme, schemeOfBackground } from '../scheme.js'

test('the palette before the terminal answers: ACRYL_TUI_THEME, then COLORFGBG, then dark (the CLI rule)', () => {
  assert.equal(paletteModeFromEnv({}), 'dark')
  assert.equal(paletteModeFromEnv({ ACRYL_TUI_THEME: ' Light ' }), 'light')
  assert.equal(paletteModeFromEnv({ ACRYL_TUI_THEME: 'light', COLORFGBG: '15;0' }), 'light')
  assert.equal(paletteModeFromEnv({ COLORFGBG: '0;15' }), 'light')
  assert.equal(paletteModeFromEnv({ COLORFGBG: '0;7' }), 'light')
  assert.equal(paletteModeFromEnv({ COLORFGBG: '15;0' }), 'dark')
  assert.equal(paletteModeFromEnv({ COLORFGBG: '15;default' }), 'dark')
  assert.equal(isPaletteForced({ ACRYL_TUI_THEME: 'dark' }), true)
  assert.equal(isPaletteForced({}), false)
})

test('a reported background decides by luminance; none reported decides nothing', () => {
  assert.equal(schemeOfBackground({ r: 255, g: 255, b: 255 }), 'light')
  assert.equal(schemeOfBackground({ r: 253, g: 246, b: 227 }), 'light')
  assert.equal(schemeOfBackground({ r: 0, g: 43, b: 54 }), 'dark')
  assert.equal(schemeOfBackground(undefined), undefined)
})

test('the theme paints with the palette of its mode', () => {
  assert.equal(paletteTheme('light').mode, 'light')
  assert.match(paletteTheme('light').color('primary')('x'), /38;2;54;82;217m/u) // #3652D9
  assert.match(paletteTheme('dark').color('primary')('x'), /38;2;79;107;254m/u) // #4F6BFE
  assert.equal(paletteTheme('sepia').mode, 'dark')
})
