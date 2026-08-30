import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../src/client/plugin-lifecycle-styles.ts', import.meta.url),
  'utf8',
)

describe('plugin lifecycle Settings styles', () => {
  it('uses the DSH theme contract instead of dark-only fallback colors', () => {
    expect(source).toContain('var(--dsw-alias-label-primary)')
    expect(source).not.toMatch(/var\(--(?:text|border|background)-/)
    expect(source).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,/)
  })

  it('reserves a full row for plugin names before lifecycle badges', () => {
    expect(source).toContain('flex-wrap: wrap;')
    expect(source).toContain('flex: 1 1 100%;')
    expect(source).toContain('width: 100%;')
  })
})
