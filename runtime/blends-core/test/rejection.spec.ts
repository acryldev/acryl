// Rejection suite (T014): table-driven over test/fixtures/rejection/ per
// REJECTION-CASES.md. Every case fails with the named diagnostic code; the
// cross-cutting assertions hold for every emitted diagnostic: non-empty path
// (FR-012) and a message naming the offending reference. Resolve-stage cases
// supply their parents/overrides inline.
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { BlendDocument } from '../src/document.js'
import type { Diagnostic, DiagnosticCode } from '../src/diagnostics.js'
import { parseDefinition } from '../src/parse.js'
import { resolveDefinition, type ResolveOptions } from '../src/resolve.js'
import { validateDefinition, type ValidationMode } from '../src/validate.js'
import { loadFixture, testRoot } from './helpers.js'

interface RejectionCase {
  id: string
  stage: 'parse' | 'validate' | 'resolve'
  mode?: ValidationMode
  resolveOptions?: ResolveOptions
  expectedCode: DiagnosticCode
  path?: string
  messageContains?: string
  count?: number
}

const PARENT = `
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
`

const CYCLE_B = `
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint

metadata:
  id: rejection.parent-cycle.b
  name: Cycle B
  version: 0.1.0

spec:
  runtime: cordis
  extends: rejection.parent-cycle
  rows: []
`

const SUPPLIED: Record<string, BlendDocument> = {}
for (const [name, source] of [
  ['rejection.parent', PARENT],
  ['rejection.parent-cycle.b', CYCLE_B],
] as const) {
  const { document, diagnostics } = parseDefinition(source)
  expect(diagnostics).toEqual([])
  SUPPLIED[name] = document as BlendDocument
}

const CASES: RejectionCase[] = [
  // Parse and shape (validation)
  { id: 'empty-file', stage: 'parse', expectedCode: 'parse-error', messageContains: 'empty' },
  { id: 'non-mapping-root', stage: 'validate', expectedCode: 'schema-error', path: '$' },
  // The parser reports both the unclosed flow sequence and its consequence.
  { id: 'unparseable-yaml', stage: 'parse', expectedCode: 'parse-error', count: 2 },
  { id: 'missing-api-version', stage: 'validate', expectedCode: 'schema-error', path: 'apiVersion' },
  {
    id: 'wrong-api-version',
    stage: 'validate',
    expectedCode: 'schema-error',
    path: 'apiVersion',
    messageContains: 'blends.acryl.dev/v1alpha1',
  },
  { id: 'unknown-kind', stage: 'validate', expectedCode: 'schema-error', path: 'kind', messageContains: 'Blueprint' },
  { id: 'missing-id', stage: 'validate', expectedCode: 'schema-error', path: 'metadata.id' },
  { id: 'missing-version', stage: 'validate', expectedCode: 'schema-error', path: 'metadata.version' },
  { id: 'unknown-root-field', stage: 'validate', expectedCode: 'schema-error', path: 'extra', messageContains: 'extra' },
  { id: 'unknown-spec-field', stage: 'validate', expectedCode: 'schema-error', path: 'spec.mode' },
  { id: 'unknown-row-field', stage: 'validate', expectedCode: 'schema-error', path: 'spec.rows[0].priority' },
  {
    id: 'duplicate-row-id',
    stage: 'validate',
    expectedCode: 'duplicate-row-id',
    path: 'spec.rows[1].id',
    messageContains: 'contacts',
  },
  { id: 'row-missing-name', stage: 'validate', expectedCode: 'schema-error', path: 'spec.rows[0].name' },
  {
    id: 'blend-without-lineage',
    stage: 'validate',
    expectedCode: 'blend-without-lineage',
    path: 'spec.lineage',
    messageContains: 'rejection.blend-without-lineage',
  },
  { id: 'blueprint-with-lineage', stage: 'validate', expectedCode: 'blueprint-with-lineage', path: 'spec.lineage' },
  {
    id: 'js-expression-distribution',
    stage: 'validate',
    mode: 'distribution',
    expectedCode: 'js-expression-in-distribution',
    path: 'spec.rows[0].disabled',
    messageContains: 'process.platform',
  },
  // Parameters (validation + resolve)
  {
    id: 'undeclared-parameter',
    stage: 'validate',
    expectedCode: 'dangling-parameter-reference',
    path: 'spec.rows[0].config.title',
    messageContains: 'nope',
  },
  {
    id: 'unused-parameter',
    stage: 'validate',
    expectedCode: 'unused-parameter',
    path: 'spec.parameters.appTitle',
    messageContains: 'appTitle',
  },
  { id: 'param-no-default', stage: 'validate', expectedCode: 'schema-error', path: 'spec.parameters.appTitle.default' },
  { id: 'param-unknown-type', stage: 'validate', expectedCode: 'schema-error', path: 'spec.parameters.appTitle.type' },
  {
    id: 'override-unknown-param',
    stage: 'resolve',
    resolveOptions: { overrides: { ghost: 'x' } },
    expectedCode: 'parameter-override-unknown',
    messageContains: 'ghost',
  },
  {
    id: 'override-type-mismatch',
    stage: 'resolve',
    resolveOptions: { overrides: { maxDealValue: 'big' } },
    expectedCode: 'parameter-type-mismatch',
    messageContains: 'maxDealValue',
  },
  // Extends and resolution
  {
    id: 'parent-not-supplied',
    stage: 'resolve',
    resolveOptions: {},
    expectedCode: 'parent-not-supplied',
    path: 'spec.extends',
    messageContains: 'rejection.missing-parent',
  },
  {
    id: 'parent-cycle',
    stage: 'resolve',
    resolveOptions: { getDefinition: (id) => SUPPLIED[id] },
    expectedCode: 'parent-cycle',
    messageContains: 'rejection.parent-cycle',
  },
  {
    id: 'override-unknown-id',
    stage: 'resolve',
    resolveOptions: { getDefinition: (id) => SUPPLIED[id] },
    expectedCode: 'override-unknown-id',
    path: 'spec.overrides[0].id',
    messageContains: 'ghost',
  },
  {
    id: 'insert-id-collision',
    stage: 'resolve',
    resolveOptions: { getDefinition: (id) => SUPPLIED[id] },
    expectedCode: 'insert-id-collision',
    path: 'spec.rows[0].id',
    messageContains: 'contacts',
  },
  { id: 'multi-parent', stage: 'validate', expectedCode: 'schema-error', path: 'spec.extends', messageContains: 'string' },
]

function diagnosticsFor(rejection: RejectionCase): Diagnostic[] {
  const { document, diagnostics: parseDiagnostics } = parseDefinition(
    loadFixture(`rejection/${rejection.id}.yaml`),
  )
  if (rejection.stage === 'parse') return parseDiagnostics
  expect(parseDiagnostics).toEqual([])
  if (rejection.stage === 'validate') {
    return validateDefinition(document, rejection.mode ?? 'distribution')
  }
  expect(validateDefinition(document, rejection.mode ?? 'distribution')).toEqual([])
  return resolveDefinition(document as BlendDocument, rejection.resolveOptions).diagnostics
}

describe('rejection suite (REJECTION-CASES.md)', () => {
  it('covers exactly the committed rejection fixtures', () => {
    const committed = readdirSync(`${testRoot}fixtures/rejection`)
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => name.replace(/\.yaml$/, ''))
      .sort()
    expect(committed).toEqual(CASES.map((rejection) => rejection.id).sort())
  })

  for (const rejection of CASES) {
    it(`rejects ${rejection.id} with ${rejection.expectedCode}`, () => {
      const diagnostics = diagnosticsFor(rejection)
      expect(diagnostics.length).toBeGreaterThan(0)
      const matching = diagnostics.filter((d) => d.code === rejection.expectedCode)
      expect(matching).toHaveLength(rejection.count ?? 1)
      const diagnostic = matching[0]!
      // FR-012: a path is never empty; the message names the reference.
      expect(diagnostic.path.length).toBeGreaterThan(0)
      expect(diagnostic.message.length).toBeGreaterThan(0)
      if (rejection.path !== undefined) expect(diagnostic.path).toBe(rejection.path)
      if (rejection.messageContains !== undefined) {
        expect(diagnostic.message).toContain(rejection.messageContains)
      }
      // Every emitted diagnostic is structured, not a generic "invalid".
      for (const d of diagnostics) {
        expect(d.path.length).toBeGreaterThan(0)
        expect(d.message.length).toBeGreaterThan(0)
      }
    })
  }
})
