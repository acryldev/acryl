// RED-GREEN spec for T013: US4 - read-only inspection (FR-011). The summary
// carries identity, kind, lineage, ordered rows, parameters; it never
// evaluates executable content and never leaks config values.
import { describe, expect, it } from 'vitest'

import { inspectDefinition } from '../../src/inspect.js'
import { GOLDEN, loadValidDefinition } from '../helpers.js'

describe('inspectDefinition (US4)', () => {
  it('reports identity, kind, ordered rows, and parameters (scenario 1)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const summary = inspectDefinition(doc)
    expect(summary).toEqual({
      id: 'acryl.crm',
      kind: 'Blueprint',
      version: '0.1.0',
      lineage: null,
      rows: [
        { id: 'contacts', name: '@acryl/contacts', disabled: false },
        { id: 'tasks', name: '@acryl/tasks', disabled: false },
        { id: 'pipeline', name: '@acryl/pipeline', disabled: false },
        { id: 'invoicing', name: '@acryl/invoicing', disabled: true },
      ],
      parameters: ['contactTitle', 'orgName', 'pipelineEnabled', 'maxDealValue'],
    })
  })

  it('reports a Blend lineage and its own rows', () => {
    const doc = loadValidDefinition(GOLDEN.acme)
    const summary = inspectDefinition(doc)
    expect(summary.lineage).toEqual({ blueprint: 'acryl.crm', blueprintVersion: '0.1.0' })
    expect(summary.kind).toBe('Blend')
    expect(summary.rows).toEqual([{ id: 'brand', name: '@acme/brand', disabled: false }])
    expect(summary.parameters).toEqual([])
  })

  it('never leaks config values into the summary', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const summary = inspectDefinition(doc)
    expect(JSON.stringify(summary)).not.toContain('My Organization')
    expect(JSON.stringify(summary)).not.toContain('greeting')
  })

  it('reports a !!js document without evaluating anything (scenario 2)', () => {
    const doc = loadValidDefinition('rejection/js-expression-distribution.yaml', 'local-authoring')
    const summary = inspectDefinition(doc)
    expect(summary.rows).toEqual([{ id: 'gate', name: '@acryl/gate', disabled: false }])
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('linux')
    expect(serialized).not.toContain('__jsExpr')
    expect(serialized).not.toContain('process.platform')
  })

  it('throws a TypeError on a document that fails the type check', () => {
    expect(() => inspectDefinition(undefined as never)).toThrow(TypeError)
    expect(() => inspectDefinition({} as never)).toThrow(TypeError)
    expect(() =>
      inspectDefinition({ apiVersion: 'x', metadata: {}, spec: {} } as never),
    ).toThrow(TypeError)
  })
})
