// Golden spec (T012): the quickstart end-to-end path for all three goldens.
// parse -> validate(distribution) -> resolve -> compile, byte-compared
// against the committed expected patch files; determinism (SC-001); host
// vocabulary check (SC-003); the layering fold (SC-006).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { compileDefinition } from '../src/compile.js'
import type { BlendDocument, PatchOp, Row } from '../src/document.js'
import { parseDefinition } from '../src/parse.js'
import { resolveDefinition, type ResolveOptions } from '../src/resolve.js'
import { validateDefinition } from '../src/validate.js'
import { GOLDEN, loadFixture, loadValidDefinition } from './helpers.js'

interface GoldenCase {
  name: string
  fixture: string
  expected: string
  resolveOptions?: ResolveOptions
  parents?: Record<string, string>
}

const GOLDEN_CASES: GoldenCase[] = [
  { name: 'acryl.zero', fixture: GOLDEN.zero, expected: 'golden/acryl.zero.expected.patch.yml' },
  { name: 'acryl.crm', fixture: GOLDEN.crm, expected: 'golden/acryl.crm.expected.patch.yml' },
  {
    name: 'acme.crm',
    fixture: GOLDEN.acme,
    expected: 'golden/acme.crm.expected.patch.yml',
    parents: { 'acryl.crm': GOLDEN.crm },
  },
]

function runGolden(golden: GoldenCase): { resolvedRows: Row[]; patchYaml: string; ops: PatchOp[] } {
  const doc = loadValidDefinition(golden.fixture)
  const parents = new Map<string, BlendDocument>()
  for (const [id, fixture] of Object.entries(golden.parents ?? {})) {
    const { document, diagnostics: parseDiagnostics } = parseDefinition(loadFixture(fixture))
    expect(parseDiagnostics).toEqual([])
    expect(validateDefinition(document, 'distribution')).toEqual([])
    parents.set(id, document as BlendDocument)
  }
  const { definition, diagnostics } = resolveDefinition(doc, {
    getDefinition: (id) => parents.get(id),
  })
  expect(diagnostics).toEqual([])
  expect(definition).not.toBeNull()
  const { patch, diagnostics: compileDiagnostics } = compileDefinition(definition!)
  expect(compileDiagnostics).toEqual([])
  expect(patch).not.toBeNull()
  return { resolvedRows: definition!.spec.rows, patchYaml: patch!.yaml, ops: patch!.ops }
}

describe('golden end-to-end (US1-US3, US5)', () => {
  for (const golden of GOLDEN_CASES) {
    it(`compiles ${golden.name} byte-for-byte against the expected patch`, () => {
      const { patchYaml } = runGolden(golden)
      const expected = readFileSync(`${import.meta.dirname}/fixtures/${golden.expected}`, 'utf8')
      expect(patchYaml).toBe(expected)
    })
  }

  it('compiles the same definition twice to byte-identical output (SC-001)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const first = compileDefinition(definition!)
    const second = compileDefinition(definition!)
    expect(second.patch?.yaml).toBe(first.patch?.yaml)
    expect(first.patch?.yaml.length ?? 0).toBeGreaterThan(0)
  })

  it('emits only host patch vocabulary, no blend-specific fields (SC-003)', () => {
    for (const golden of GOLDEN_CASES) {
      const { ops } = runGolden(golden)
      for (const op of ops) {
        const keys = Object.keys(op)
        if (keys.includes('insert')) {
          expect(keys).toEqual(['insert'])
          for (const row of op.insert ?? []) {
            expect(Object.keys(row).every((key) => ['id', 'name', 'config', 'disabled'].includes(key))).toBe(true)
          }
        } else {
          expect(keys.every((key) => ['id', 'name', 'config', 'disabled'].includes(key))).toBe(true)
          expect(keys).toContain('id')
        }
      }
      // Re-parsing the emitted YAML yields the same op model.
      const emitted = runGolden(golden)
      expect(parseYaml(emitted.patchYaml)).toEqual(emitted.ops)
    }
  })

  it('folds parent ops then child ops into the child resolved rows (SC-006)', () => {
    // The host applies patches in chain order: the parent's insert first,
    // then the child's insert appends and the child's override ops merge
    // shallowly. The result must equal the child's resolved row list.
    const crm = loadValidDefinition(GOLDEN.crm)
    const crmResolved = resolveDefinition(crm).definition
    expect(crmResolved).not.toBeNull()
    const crmOps = compileDefinition(crmResolved!).patch?.ops ?? []

    const acme = loadValidDefinition(GOLDEN.acme)
    const parent = crm
    const acmeResolved = resolveDefinition(acme, {
      getDefinition: (id) => (id === parent.metadata.id ? parent : undefined),
    }).definition
    expect(acmeResolved).not.toBeNull()
    const acmeOps = compileDefinition(acmeResolved!).patch?.ops ?? []

    // Fold: apply the parent ops, then the child ops.
    let rows: Row[] = []
    for (const op of [...crmOps, ...acmeOps]) {
      if (op.insert !== undefined) {
        rows = [...rows, ...op.insert]
      } else {
        rows = rows.map((row) =>
          row.id === op.id
            ? {
                ...row,
                ...(op.name !== undefined ? { name: op.name } : {}),
                ...(op.config !== undefined ? { config: { ...row.config, ...op.config } } : {}),
                ...(op.disabled !== undefined ? { disabled: op.disabled } : {}),
              }
            : row,
        )
      }
    }
    expect(rows).toEqual(acmeResolved!.spec.rows)
  })

  it('refuses to compile a resolved definition that still carries tokens (FR-007)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    expect(definition).not.toBeNull()
    const unresolved: typeof definition = definition && {
      ...definition,
      delta: {
        insert: [{ id: 'x', name: '@x/y', config: { title: '{{parameters.orgName}}' } }],
        overrides: [],
      },
    }
    const { patch, diagnostics } = compileDefinition(unresolved!)
    expect(patch).toBeNull()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('schema-error')
    expect(diagnostics[0]?.message).toContain('{{parameters.orgName}}')
    expect(diagnostics[0]?.path).toBe('delta.insert[0].config.title')
  })
})
