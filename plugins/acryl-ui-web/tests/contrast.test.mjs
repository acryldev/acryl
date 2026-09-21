import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// WCAG 2.x relative luminance and contrast ratio (spec 038-ui-component-library, tasks.md T013: contrast in both modes).
const roles = JSON.parse(readFileSync(fileURLToPath(new URL('../contracts/tokens.json', import.meta.url)), 'utf8')).roles
const luminance = hex => {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [16, 8, 0].map(shift => ((n >> shift) & 255) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

// A terminal owns its background, so the palette is checked against the plain defaults and against the tinted backgrounds popular themes use.
const BACKGROUNDS = { dark: { pure: '#000000', tinted: ['#1E1E1E', '#0D1117'] }, light: { pure: '#FFFFFF', tinted: ['#F5F5F5', '#EEEEEE'] } }
const DECORATIVE = { border: 1.4 }   // a rule, not text
const DIMMED = new Set(['textDimmed'])   // placeholder-level text: 3:1

test('every terminal role is readable in both palettes: text 4.5:1 on a plain terminal and 3:1 on tinted ones, dimmed text 3:1, borders 1.4:1', () => {
  let checked = 0
  for (const [role, { terminal }] of Object.entries(roles)) {
    for (const mode of ['dark', 'light']) {
      const hex = terminal[mode]
      if (hex === null) continue   // the terminal's own default foreground/background
      const { pure, tinted } = BACKGROUNDS[mode]
      const onPure = contrast(hex, pure)
      const onTinted = Math.min(...tinted.map(bg => contrast(hex, bg)))
      const [pureMin, tintedMin] = role in DECORATIVE ? [DECORATIVE[role], DECORATIVE[role]] : DIMMED.has(role) ? [3, 3] : [4.5, 3]
      assert.ok(onPure >= pureMin, `${role} (${mode}) ${hex} is ${onPure.toFixed(2)}:1 on ${pure}, needs ${pureMin}`)
      assert.ok(onTinted >= tintedMin, `${role} (${mode}) ${hex} is ${onTinted.toFixed(2)}:1 on a tinted background, needs ${tintedMin}`)
      checked += 1
    }
  }
  assert.ok(checked >= 20, 'the palette was actually measured')
})

test('the two roles this library defines for the web (accent, reasoning) are readable in both color schemes', () => {
  for (const role of ['accent', 'reasoning']) {
    const [, light, dark] = /light-dark\((#[0-9A-Fa-f]{6}),\s*(#[0-9A-Fa-f]{6})\)/u.exec(roles[role].web) ?? []
    assert.ok(light && dark, `${role} is a light-dark() pair`)
    assert.ok(contrast(light, '#FFFFFF') >= 4.5, `${role} light ${light} on white is ${contrast(light, '#FFFFFF').toFixed(2)}:1`)
    for (const bg of ['#1E1E1E', '#0F1115']) assert.ok(contrast(dark, bg) >= 4, `${role} dark ${dark} on ${bg} is ${contrast(dark, bg).toFixed(2)}:1`)
  }
})

test('the contrast function is right (white on black is 21:1, equal colors 1:1)', () => {
  assert.equal(contrast('#FFFFFF', '#000000').toFixed(2), '21.00'); assert.equal(contrast('#777777', '#777777').toFixed(2), '1.00')
})
