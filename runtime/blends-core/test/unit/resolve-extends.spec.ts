// RED-GREEN spec for T009: US5 acceptance scenarios (extends) - bottom-up
// single-parent resolution, shallow per-key override merge (D13, FR-015),
// delta retention for compile (FR-016), and the chain diagnostics (FR-013,
// FR-014): parent-not-supplied, parent-cycle, override-unknown-id,
// insert-id-collision.
import { describe, expect, it } from 'vitest'

import type { BlendDocument } from '../../src/document.js'
import { parseDefinition } from '../../src/parse.js'
import { resolveDefinition } from '../../src/resolve.js'
import { validateDefinition } from '../../src/validate.js'
import { GOLDEN, loadValidDefinition } from '../helpers.js'

function parseDocument(source: string): BlendDocument {
  const { document, diagnostics: parseDiagnostics } = parseDefinition(source)
  expect([...parseDiagnostics, ...validateDefinition(document, 'distribution')]).toEqual([])
  return document as BlendDocument
}

describe('resolveDefinition extends (US5)', () => {
  it('resolves acme.crm against its lineage blueprint (scenario 1)', () => {
    // acme.crm declares lineage but no extends: the lineage origin is the
    // resolution parent for a Blend.
    const doc = loadValidDefinition(GOLDEN.acme)
    const parent = loadValidDefinition(GOLDEN.crm)
    const { definition, diagnostics } = resolveDefinition(doc, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    })
    expect(diagnostics).toEqual([])
    const rows = definition?.spec.rows ?? []
    expect(rows.map((row) => row.id)).toEqual(['contacts', 'tasks', 'pipeline', 'invoicing', 'brand'])
    // Shallow per-key merge (D13): keys the override sets win; the omitted
    // greeting key inherits the parent's substituted value.
    expect(rows[0]).toEqual({
      id: 'contacts',
      name: '@acryl/contacts',
      config: { title: 'People', org: 'ACME Corp', greeting: 'Hello from My Organization' },
    })
    expect(rows[1]).toEqual({ id: 'tasks', name: '@acryl/tasks' })
    expect(rows[2]).toEqual({
      id: 'pipeline',
      name: '@acryl/pipeline',
      config: { enabled: true, maxDealValue: 1000000 },
      disabled: true,
    })
    expect(rows[3]).toEqual({ id: 'invoicing', name: '@acryl/invoicing', disabled: true })
    expect(rows[4]).toEqual({ id: 'brand', name: '@acme/brand', config: { mark: 'acme' } })
  })

  it('retains lineage, drops consumed spec sections, and keeps the delta (FR-016)', () => {
    const doc = loadValidDefinition(GOLDEN.acme)
    const parent = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    })
    expect(definition?.spec).toMatchObject({
      runtime: 'cordis',
      lineage: { blueprint: 'acryl.crm', blueprintVersion: '0.1.0' },
    })
    expect(definition?.spec).not.toHaveProperty('extends')
    expect(definition?.spec).not.toHaveProperty('overrides')
    expect(definition?.spec).not.toHaveProperty('parameters')
    // The delta carries only the keys the child set, in declaration order.
    expect(definition?.delta).toEqual({
      insert: [{ id: 'brand', name: '@acme/brand', config: { mark: 'acme' } }],
      overrides: [
        { id: 'contacts', config: { title: 'People', org: 'ACME Corp' } },
        { id: 'pipeline', disabled: true },
      ],
    })
  })

  it('does not mutate the supplied parent document', () => {
    const doc = loadValidDefinition(GOLDEN.acme)
    const parent = loadValidDefinition(GOLDEN.crm)
    resolveDefinition(doc, { getDefinition: (id) => (id === parent.metadata.id ? parent : undefined) })
    resolveDefinition(doc, { getDefinition: (id) => (id === parent.metadata.id ? parent : undefined) })
    // The parent document is untouched: its tokens are still unresolved and
    // its row list unchanged, so the same parent object can serve many
    // children.
    expect(parent.spec.rows?.[0]?.config?.title).toBe('{{parameters.contactTitle}}')
    expect(parent.spec.rows).toHaveLength(4)
  })

  it('reports parent-not-supplied naming the missing lineage parent (scenario 5)', () => {
    const doc = loadValidDefinition(GOLDEN.acme)
    const { definition, diagnostics } = resolveDefinition(doc)
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'parent-not-supplied',
      path: 'spec.lineage.blueprint',
    })
    expect(diagnostics[0]?.message).toContain('acryl.crm')
  })

  it('reports parent-not-supplied pointing at spec.extends for explicit extends', () => {
    const doc = loadValidDefinition('rejection/parent-not-supplied.yaml')
    const { definition, diagnostics } = resolveDefinition(doc)
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'parent-not-supplied',
      path: 'spec.extends',
    })
    expect(diagnostics[0]?.message).toContain('rejection.missing-parent')
  })

  it('reports a cyclic chain naming the repeated id (scenario 5)', () => {
    const a = parseDocument(`
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: test.cycle.a
  name: Cycle A
  version: 0.1.0

spec:
  runtime: cordis
  extends: test.cycle.b
  rows:
    - id: a-row
      name: '@test/a'
`)
    const b = parseDocument(`
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: test.cycle.b
  name: Cycle B
  version: 0.1.0

spec:
  runtime: cordis
  extends: test.cycle.a
  rows:
    - id: b-row
      name: '@test/b'
`)
    const { definition, diagnostics } = resolveDefinition(a, {
      getDefinition: (id) => (id === b.metadata.id ? b : undefined),
    })
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('parent-cycle')
    expect(diagnostics[0]?.message).toContain('test.cycle.a')
  })

  it('reports an override targeting an unknown row id (scenario 2)', () => {
    const doc = loadValidDefinition('rejection/override-unknown-id.yaml')
    const parent = parseDocument(`
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: rejection.parent
  name: Parent with known rows
  version: 0.1.0

spec:
  runtime: cordis
  rows:
    - id: contacts
      name: '@acryl/contacts'
`)
    const { definition, diagnostics } = resolveDefinition(doc, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    })
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'override-unknown-id',
      path: 'spec.overrides[0].id',
    })
    expect(diagnostics[0]?.message).toContain('ghost')
  })

  it('reports a new row colliding with a resolved parent row id (scenario 3)', () => {
    const doc = loadValidDefinition('rejection/insert-id-collision.yaml')
    const parent = parseDocument(`
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: rejection.parent
  name: Parent with known rows
  version: 0.1.0

spec:
  runtime: cordis
  rows:
    - id: contacts
      name: '@acryl/contacts'
`)
    const { definition, diagnostics } = resolveDefinition(doc, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    })
    expect(definition).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'insert-id-collision',
      path: 'spec.rows[0].id',
    })
    expect(diagnostics[0]?.message).toContain('contacts')
  })

  it('resolves a two-level chain bottom-up (grandparent defaults apply)', () => {
    const crm = loadValidDefinition(GOLDEN.crm)
    // acme.crm resolves over the chain when supplied both links; the caller
    // only needs getDefinition over the whole set.
    const docs: Record<string, BlendDocument> = { [crm.metadata.id]: crm }
    const doc = loadValidDefinition(GOLDEN.acme)
    docs[doc.metadata.id] = doc
    const { definition, diagnostics } = resolveDefinition(doc, {
      getDefinition: (id) => docs[id],
    })
    expect(diagnostics).toEqual([])
    expect(definition?.spec.rows.map((row) => row.id)).toEqual([
      'contacts',
      'tasks',
      'pipeline',
      'invoicing',
      'brand',
    ])
  })
})
