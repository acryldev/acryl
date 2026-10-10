import { describe, expect, it } from 'vitest'
import { patchNodeGapImports } from '../src/bun-node-gap-shims.ts'

describe('patchNodeGapImports', () => {
  it('removes only the missing name from a shared import and defines it', () => {
    const out = patchNodeGapImports('import { getSystemErrorMessage, getSystemErrorName, inspect } from "node:util";\nuse(getSystemErrorMessage(1))')
    expect(out).toContain('import { getSystemErrorName, inspect } from "node:util";')
    expect(out).toContain('const getSystemErrorMessage =')
    expect(out).not.toMatch(/import \{[^}]*getSystemErrorMessage/)
  })

  it('drops an import statement whose only name is missing', () => {
    const out = patchNodeGapImports("import { isSea } from 'node:sea';\nconsole.log(isSea())")
    expect(out).not.toContain('node:sea')
    expect(out).toContain('const isSea = () => false;')
  })

  it('patches several gaps in one file', () => {
    const out = patchNodeGapImports('import { stripTypeScriptTypes } from "node:module";\nimport { getSystemErrorMessage } from "node:util";\n')
    expect(out).toContain('const stripTypeScriptTypes =')
    expect(out).toContain('const getSystemErrorMessage =')
  })

  it('returns a file with no gap import unchanged', () => {
    const source = 'import { inspect } from "node:util";\nimport { createRequire } from "node:module";\n'
    expect(patchNodeGapImports(source)).toBe(source)
  })
})
