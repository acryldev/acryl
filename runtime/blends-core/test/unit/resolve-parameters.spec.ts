// RED-GREEN spec for T008 + T010: US2 acceptance scenarios (resolve) -
// typed whole-token vs embedded-token substitution (D11), overrides with
// declaration/type validation, defaults with zero overrides (FR-006, FR-007).
import { describe, expect, it } from 'vitest'

import type { BlendDocument } from '../../src/document.js'
import { parseDefinition } from '../../src/parse.js'
import { resolveDefinition } from '../../src/resolve.js'
import { validateDefinition } from '../../src/validate.js'
import { GOLDEN, loadValidDefinition } from '../helpers.js'

describe('resolveDefinition parameters (US2)', () => {
  it('resolves with declared defaults and zero overrides (scenario 1)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition, diagnostics } = resolveDefinition(doc)
    expect(diagnostics).toEqual([])
    expect(definition).not.toBeNull()
    const rows = definition?.spec.rows ?? []
    expect(rows.map((row) => row.id)).toEqual(['contacts', 'tasks', 'pipeline', 'invoicing'])
    expect(rows[0]?.config).toEqual({
      title: 'Contacts',
      org: 'My Organization',
      greeting: 'Hello from My Organization',
    })
  })

  it('substitutes whole tokens with typed values, embedded tokens as strings (D11)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const pipelineConfig = definition?.spec.rows[2]?.config
    expect(pipelineConfig?.enabled).toBe(true)
    expect(typeof pipelineConfig?.enabled).toBe('boolean')
    expect(pipelineConfig?.maxDealValue).toBe(1000000)
    expect(typeof pipelineConfig?.maxDealValue).toBe('number')
    const greeting = definition?.spec.rows[0]?.config?.greeting
    expect(greeting).toBe('Hello from My Organization')
    expect(typeof greeting).toBe('string')
  })

  it('leaves no parameter tokens anywhere in the resolved definition (FR-007)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    expect(JSON.stringify(definition)).not.toContain('{{parameters.')
  })

  it('drops consumed spec sections from the resolved shape', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    expect(definition?.spec).not.toHaveProperty('parameters')
    expect(definition?.spec).not.toHaveProperty('extends')
    expect(definition?.spec).not.toHaveProperty('overrides')
    expect(definition?.spec.runtime).toBe('cordis')
  })

  it('replaces every reference with the override value (scenario 2)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition, diagnostics } = resolveDefinition(doc, { overrides: { orgName: 'ACME Corp' } })
    expect(diagnostics).toEqual([])
    const contacts = definition?.spec.rows[0]?.config
    expect(contacts?.org).toBe('ACME Corp')
    expect(contacts?.greeting).toBe('Hello from ACME Corp')
    expect(contacts?.title).toBe('Contacts')
  })

  it('applies typed overrides (boolean, number)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc, {
      overrides: { pipelineEnabled: false, maxDealValue: 5 },
    })
    expect(definition?.spec.rows[2]?.config).toEqual({ enabled: false, maxDealValue: 5 })
  })

  it('fails naming an undeclared override (scenario 3)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition, diagnostics } = resolveDefinition(doc, { overrides: { nope: 'x' } })
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('parameter-override-unknown')
    expect(diagnostics[0]?.message).toContain('nope')
  })

  it('fails naming a type-mismatched override', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition, diagnostics } = resolveDefinition(doc, { overrides: { maxDealValue: 'big' } })
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('parameter-type-mismatch')
    expect(diagnostics[0]?.message).toContain('maxDealValue')
  })

  it('substitutes tokens inside override config values too', () => {
    // A child's own delta may reference the child's declared parameters
    // (D11: tokens live in row and override config string values alike).
    const parent = loadValidDefinition(GOLDEN.crm)
    const source = `
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: test.param-override
  name: Param override child
  version: 0.1.0

spec:
  runtime: cordis
  extends: acryl.crm
  parameters:
    who:
      type: string
      default: World
  rows: []
  overrides:
    - id: contacts
      config:
        greeting: 'Hi {{parameters.who}}'
`
    const { document, diagnostics: parseDiagnostics } = parseDefinition(source)
    expect([...parseDiagnostics, ...validateDefinition(document, 'distribution')]).toEqual([])
    const { definition, diagnostics } = resolveDefinition(document as BlendDocument, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    })
    expect(diagnostics).toEqual([])
    expect(definition?.spec.rows[0]?.config?.greeting).toBe('Hi World')
  })
})
