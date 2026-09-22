import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// WCAG 2.x contrast for the terminal palette and the two web tokens this library registers (spec 038-ui-component-library, tasks.md T013).
const roles = JSON.parse(readFileSync(fileURLToPath(new URL('../contracts/tokens.json', import.meta.url)), 'utf8')).roles as Record<string, { web: string | null, terminal: { dark: string | null, light: string | null } }>
const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [16, 8, 0].map(shift => ((n >> shift) & 255) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05) }
const BACKGROUNDS = { dark: { pure: '#000000', tinted: ['#1E1E1E', '#0D1117'] }, light: { pure: '#FFFFFF', tinted: ['#F5F5F5', '#EEEEEE'] } } as const
const DECORATIVE: Record<string, number> = { border: 1.4 }

describe('contrast', () => {
  it('every terminal role is readable in both palettes: text 4.5:1 plain and 3:1 tinted, dimmed text 3:1, borders 1.4:1', () => {
    let checked = 0
    for (const [role, { terminal }] of Object.entries(roles)) {
      for (const mode of ['dark', 'light'] as const) {
        const hex = terminal[mode]
        if (hex === null) continue
        const { pure, tinted } = BACKGROUNDS[mode]
        const [pureMin, tintedMin] = role in DECORATIVE ? [DECORATIVE[role] as number, DECORATIVE[role] as number] : role === 'textDimmed' ? [3, 3] : [4.5, 3]
        expect(contrast(hex, pure), `${role} ${mode} on ${pure}`).toBeGreaterThanOrEqual(pureMin)
        expect(Math.min(...tinted.map(bg => contrast(hex, bg))), `${role} ${mode} tinted`).toBeGreaterThanOrEqual(tintedMin)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20)
  })

  it('the registered web tokens accent and reasoning are readable in both color schemes', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/client/index.ts', import.meta.url)), 'utf8')
    for (const token of ['--acryl-accent', '--acryl-reasoning']) {
      const [, light, dark] = new RegExp(`'${token}': \\{ light: '(#[0-9A-Fa-f]{6})', dark: '(#[0-9A-Fa-f]{6})' \\}`, 'u').exec(source) ?? []
      expect(light && dark, token).toBeTruthy()
      expect(contrast(light as string, '#FFFFFF'), `${token} light`).toBeGreaterThanOrEqual(4.5)
      for (const bg of ['#1E1E1E', '#0F1115']) expect(contrast(dark as string, bg), `${token} dark on ${bg}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('white on black is 21:1', () => { expect(contrast('#FFFFFF', '#000000').toFixed(2)).toBe('21.00') })
})
