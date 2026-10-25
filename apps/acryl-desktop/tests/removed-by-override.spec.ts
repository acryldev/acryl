import { describe, expect, it } from 'vitest'
import { packagesRemovedByOverride } from '../scripts/removed-by-override.ts'

describe('packages the workspace removes with an override', () => {
  it("reads only the overrides set to '-'", () => {
    const workspace = "overrides:\n  koffi: 3.1.5\n  node-addon-require-builtin: '-'\n  '@scope/gone': '-'\n"
    expect([...packagesRemovedByOverride(workspace)].sort()).toEqual(['@scope/gone', 'node-addon-require-builtin'])
    expect(packagesRemovedByOverride('packages: []\n').size).toBe(0)
    expect(packagesRemovedByOverride('').size).toBe(0)
  })

  it('includes the native internals add-on in the real workspace', () => {
    expect(packagesRemovedByOverride().has('node-addon-require-builtin')).toBe(true)
  })
})
