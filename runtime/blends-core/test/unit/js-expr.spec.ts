// T007: the !!js seam - marker shape, local evaluation, distribution rejection.
import { describe, expect, it } from 'vitest'

import { parseDefinition } from '../../src/parse.js'
import { validateDefinition } from '../../src/validate.js'
import { evaluateJsExpr, isJsExpr } from '../../src/js-expr.js'
import { loadFixture } from '../helpers.js'

describe('!!js markers', () => {
  it('parses a !!js scalar into a marker, not a value', () => {
    const { document } = parseDefinition(loadFixture('rejection/js-expression-distribution.yaml'))
    const spec = (document as { spec: { rows: { disabled: unknown }[] } }).spec
    expect(isJsExpr(spec.rows[0]?.disabled)).toBe(true)
    expect(spec.rows[0]?.disabled).toEqual({ __jsExpr: "process.platform === 'linux'" })
  })

  it('evaluates in local mode with the documented process scope', () => {
    expect(evaluateJsExpr("process.platform === 'darwin'")).toBe(
      process.platform === 'darwin',
    )
    expect(evaluateJsExpr('1 + 1')).toBe(2)
  })

  it('is rejected by distribution-mode validation but passes local-authoring', () => {
    const { document } = parseDefinition(loadFixture('rejection/js-expression-distribution.yaml'))
    expect(validateDefinition(document, 'distribution')).toEqual([
      expect.objectContaining({ code: 'js-expression-in-distribution' }),
    ])
    expect(validateDefinition(document, 'local-authoring')).toEqual([])
  })
})
