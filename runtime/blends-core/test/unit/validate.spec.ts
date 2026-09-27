// RED-GREEN spec for T006: US1 acceptance scenarios (validate) plus the
// validation half of US2 (dangling/unused parameters, FR-006).
import { describe, expect, it } from 'vitest'

import { parseDefinition } from '../../src/parse.js'
import { validateDefinition } from '../../src/validate.js'
import { GOLDEN, loadFixture } from '../helpers.js'

describe('validateDefinition (US1)', () => {
  it('accepts the golden definitions in both trust modes', () => {
    for (const fixture of [GOLDEN.zero, GOLDEN.crm, GOLDEN.acme]) {
      const { document, diagnostics: parseDiags } = parseDefinition(loadFixture(fixture))
      expect(parseDiags).toEqual([])
      expect(validateDefinition(document, 'local-authoring')).toEqual([])
      expect(validateDefinition(document, 'distribution')).toEqual([])
    }
  })

  it('rejects a Blend without lineage, naming the location (scenario 2)', () => {
    const { document } = parseDefinition(loadFixture('rejection/blend-without-lineage.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      code: 'blend-without-lineage',
      path: 'spec.lineage',
    })
    expect(diags[0]?.message).toContain('rejection.blend-without-lineage')
  })

  it('rejects a Blueprint with lineage (scenario 2 inverse)', () => {
    const { document } = parseDefinition(loadFixture('rejection/blueprint-with-lineage.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      code: 'blueprint-with-lineage',
      path: 'spec.lineage',
    })
  })

  it('rejects duplicate row ids, naming the duplicated id (scenario 3)', () => {
    const { document } = parseDefinition(loadFixture('rejection/duplicate-row-id.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      code: 'duplicate-row-id',
      path: 'spec.rows[1].id',
    })
    expect(diags[0]?.message).toContain('contacts')
  })

  it('rejects unknown fields, naming the field path (scenario 4)', () => {
    const { document } = parseDefinition(loadFixture('rejection/unknown-root-field.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    expect(diags).toHaveLength(1)
    expect(diags[0]?.code).toBe('schema-error')
    expect(diags[0]?.path).toBe('extra')
    expect(diags[0]?.message).toContain('extra')
  })

  it('rejects !!js in distribution mode, naming the expression (scenario 5)', () => {
    const { document } = parseDefinition(loadFixture('rejection/js-expression-distribution.yaml'))
    const diags = validateDefinition(document, 'distribution')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      code: 'js-expression-in-distribution',
      path: 'spec.rows[0].disabled',
    })
    expect(diags[0]?.message).toContain("process.platform === 'linux'")
  })

  it('accepts the same !!js document in local-authoring mode (scenario 6)', () => {
    const { document } = parseDefinition(loadFixture('rejection/js-expression-distribution.yaml'))
    expect(validateDefinition(document, 'local-authoring')).toEqual([])
  })
})

describe('parameter wiring (US2 validation half, FR-006)', () => {
  it('rejects references to undeclared parameters, naming the reference', () => {
    const { document } = parseDefinition(loadFixture('rejection/undeclared-parameter.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    // Both wiring failures are reported: the dangling reference AND the
    // now-unused declared parameter (validate returns ALL diagnostics).
    expect(diags).toHaveLength(2)
    expect(diags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'dangling-parameter-reference',
          path: 'spec.rows[0].config.title',
        }),
        expect.objectContaining({
          code: 'unused-parameter',
          path: 'spec.parameters.appTitle',
        }),
      ]),
    )
    const dangling = diags.find((d) => d.code === 'dangling-parameter-reference')
    expect(dangling?.message).toContain('nope')
  })

  it('rejects declared-but-unreferenced parameters, naming the parameter', () => {
    const { document } = parseDefinition(loadFixture('rejection/unused-parameter.yaml'))
    const diags = validateDefinition(document, 'local-authoring')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      code: 'unused-parameter',
      path: 'spec.parameters.appTitle',
    })
    expect(diags[0]?.message).toContain('appTitle')
  })
})
