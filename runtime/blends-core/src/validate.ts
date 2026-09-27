// validateDefinition: schema + semantic validation. The boundary validates
// (FR-002, FR-005, FR-012); an empty diagnostic list means valid. Schema
// errors short-circuit: semantic checks assume the schema-validated shape.
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { AnySchemaObject, ErrorObject } from 'ajv'

import schemaJson from './schema/blend-manifest.v1alpha1.schema.json' with { type: 'json' }
import {
  diagnostic,
  joinField,
  joinIndex,
  ROOT_PATH,
  type Diagnostic,
  type DiagnosticCode,
} from './diagnostics.js'
import type { BlendDocument } from './document.js'
import { isJsExpr } from './js-expr.js'
import { PARAMETER_TOKEN, walkConfigStrings } from './parameters.js'

// The compiled validator is immutable; module scope is the one-time cost.
const ajv = new Ajv2020({ allErrors: true })
const validateSchema = ajv.compile<BlendDocument>(schemaJson as AnySchemaObject)

export type ValidationMode = 'local-authoring' | 'distribution'

export function validateDefinition(document: unknown, mode: ValidationMode): Diagnostic[] {
  if (!validateSchema(document)) {
    return validateSchema.errors?.map(toDiagnostic) ?? []
  }

  // The guard passed, so the document conforms to the schema shape. The cast
  // is the boundary assertion: ajv's predicate types `data` as `any`, which
  // does not narrow an `unknown` argument under TS 6, and a plain cast here
  // stays honest because validation already ran.
  const doc = document as BlendDocument
  const diagnostics: Diagnostic[] = []
  diagnostics.push(...checkKindLineage(doc))
  diagnostics.push(...checkRowIdUniqueness(doc))
  diagnostics.push(...checkParameterWiring(doc))
  diagnostics.push(...checkOverridesHaveParent(doc))
  if (mode === 'distribution') {
    diagnostics.push(...checkJsExpressions(doc))
  }
  return diagnostics
}

// ajv ErrorObject -> Diagnostic with a path pointing at the offending field.
function toDiagnostic(error: ErrorObject): Diagnostic {
  const leafAtRoot = error.instancePath === ''
  let path = leafAtRoot ? '' : prettyInstancePath(error.instancePath)
  let message = error.message ?? 'is invalid'
  switch (error.keyword) {
    case 'required': {
      path = joinField(path, String(error.params.missingProperty))
      message = `missing required field '${String(error.params.missingProperty)}'`
      break
    }
    case 'additionalProperties': {
      const key = String(error.params.additionalProperty)
      path = joinField(path, key)
      message = `unknown field '${key}'`
      break
    }
    case 'const': {
      message = `must equal ${JSON.stringify(error.params.allowedValue)}`
      break
    }
    case 'enum': {
      const values = (error.params.allowedValues as unknown[]).map((v) => JSON.stringify(v))
      message = `must be one of ${values.join(', ')}`
      break
    }
    case 'pattern': {
      message = `must match pattern ${String(error.params.pattern)}`
      break
    }
    case 'minLength': {
      message = `must be at least ${String(error.params.limit)} character(s)`
      break
    }
    default:
      break
  }
  // FR-012: a diagnostic's path is never empty. Leaf errors at the document
  // root keep an empty working path so joinField produces 'extra' (not
  // '$.extra'); the emitted path falls back to the document root marker.
  const finalPath = path === '' ? ROOT_PATH : path
  return diagnostic('schema-error', finalPath, path === '' ? message : `${path}: ${message}`)
}

// '/spec/rows/0/id' -> 'spec.rows[0].id'; '' -> '$'.
function prettyInstancePath(instancePath: string): string {
  if (instancePath === '') return ROOT_PATH
  let path = ''
  for (const segment of instancePath.split('/').slice(1)) {
    if (/^\d+$/.test(segment)) {
      path = joinIndex(path, Number(segment))
    } else {
      path = joinField(path, segment)
    }
  }
  return path
}

function checkKindLineage(doc: BlendDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const { kind, spec } = doc
  if (kind === 'Blend' && spec.lineage === undefined) {
    diagnostics.push(
      diagnostic(
        'blend-without-lineage',
        'spec.lineage',
        `blend '${doc.metadata.id}' must declare spec.lineage (origin definition id and version)`,
      ),
    )
  }
  if (kind === 'Blueprint' && spec.lineage !== undefined) {
    diagnostics.push(
      diagnostic(
        'blueprint-with-lineage',
        'spec.lineage',
        `blueprint '${doc.metadata.id}' must not declare spec.lineage; lineage belongs to Blends`,
      ),
    )
  }
  if (spec.extends !== undefined && spec.lineage !== undefined && spec.extends !== spec.lineage.blueprint) {
    diagnostics.push(
      diagnostic(
        'lineage-extends-mismatch',
        'spec.extends',
        `extends '${spec.extends}' must agree with lineage.blueprint '${spec.lineage.blueprint}'`,
      ),
    )
  }
  return diagnostics
}

function checkRowIdUniqueness(doc: BlendDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seen = new Set<string>()
  const rows = doc.spec.rows ?? []
  const overrides = doc.spec.overrides ?? []
  for (const [list, listName] of [
    [rows, 'rows'],
    [overrides, 'overrides'],
  ] as const) {
    for (const [index, entry] of list.entries()) {
      const path = joinField(joinIndex(`spec.${listName}`, index), 'id')
      if (seen.has(entry.id)) {
        diagnostics.push(
          diagnostic('duplicate-row-id', path, `row id '${entry.id}' is already used in this definition`),
        )
      }
      seen.add(entry.id)
    }
  }
  return diagnostics
}

// Parameter token references live in config string values of the
// definition's own delta (rows and overrides), nested maps and arrays
// included (D11); the grammar and walk live in parameters.ts.
function checkParameterWiring(doc: BlendDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const declared = doc.spec.parameters ?? {}
  const referenced = new Map<string, string>()
  const rows = doc.spec.rows ?? []
  const overrides = doc.spec.overrides ?? []
  const recordReference = (value: string, path: string): void => {
    for (const match of value.matchAll(PARAMETER_TOKEN)) {
      referenced.set(match[1] ?? '', path)
    }
  }
  for (const [index, row] of rows.entries()) {
    if (row.config !== undefined) {
      walkConfigStrings(row.config, joinField(joinIndex('spec.rows', index), 'config'), recordReference)
    }
  }
  for (const [index, entry] of overrides.entries()) {
    if (entry.config !== undefined) {
      walkConfigStrings(entry.config, joinField(joinIndex('spec.overrides', index), 'config'), recordReference)
    }
  }
  for (const [name, path] of referenced) {
    if (!Object.hasOwn(declared, name)) {
      diagnostics.push(
        diagnostic(
          'dangling-parameter-reference',
          path,
          `parameter '${name}' is referenced but not declared in spec.parameters`,
        ),
      )
    }
  }
  for (const name of Object.keys(declared)) {
    if (!referenced.has(name)) {
      diagnostics.push(
        diagnostic(
          'unused-parameter',
          joinField('spec.parameters', name),
          `parameter '${name}' is declared but never referenced in any row config`,
        ),
      )
    }
  }
  return diagnostics
}

function checkOverridesHaveParent(doc: BlendDocument): Diagnostic[] {
  const hasParent =
    doc.spec.extends !== undefined || (doc.kind === 'Blend' && doc.spec.lineage !== undefined)
  if ((doc.spec.overrides ?? []).length > 0 && !hasParent) {
    return [
      diagnostic(
        'overrides-without-parent',
        'spec.overrides',
        `definition '${doc.metadata.id}' declares overrides without a resolvable parent (spec.extends or Blend lineage)`,
      ),
    ]
  }
  return []
}

function checkJsExpressions(doc: BlendDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) visit(item, joinIndex(path, index))
      return
    }
    if (value !== null && typeof value === 'object') {
      if (isJsExpr(value)) {
        diagnostics.push(
          diagnostic(
            'js-expression-in-distribution',
            path,
            `!!js expression '${value.__jsExpr}' is not allowed in distribution mode`,
          ),
        )
        return
      }
      for (const [key, item] of Object.entries(value)) visit(item, joinField(path, key))
    }
  }
  visit(doc, '')
  return diagnostics
}
