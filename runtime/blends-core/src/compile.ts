// compileDefinition: resolved definition -> host patch vocabulary (D12,
// FR-008, FR-016). One insert op with the definition's new rows, then one
// override op per changed inherited row in declaration order, carrying only
// the keys the definition set. Deterministic: fixed stringify options
// (SC-001). No blend-specific field leaks into the output.
import { stringify as yamlStringify } from 'yaml'

import { diagnostic, type Diagnostic } from './diagnostics.js'
import type { CompiledPatch, OverrideEntry, PatchOp, ResolvedDefinition, Row } from './document.js'
import { evaluateJsExpr, isJsExpr } from './js-expr.js'
import { walkConfigStrings } from './parameters.js'

export interface CompileResult {
  patch: CompiledPatch | null
  diagnostics: Diagnostic[]
}

// Determinism-critical: no line wrapping, no anchors/aliases for duplicate
// object references, map keys emit in insertion order. This is the one place
// where library configuration is byte-stability-critical (SC-001).
const STRINGIFY_OPTIONS = {
  lineWidth: 0,
  aliasDuplicateObjects: false,
}

export function compileDefinition(resolved: ResolvedDefinition): CompileResult {
  // Cheap re-check for a caller that skipped resolution: a resolved
  // definition must not contain parameter tokens (FR-007).
  const diagnostics = checkUnresolvedTokens(resolved)
  if (diagnostics.length > 0) return { patch: null, diagnostics }

  const ops: PatchOp[] = [{ insert: resolved.delta.insert.map(evaluateRow) }]
  for (const entry of resolved.delta.overrides) {
    const evaluated = evaluateJsDeep(entry) as OverrideEntry
    const op: PatchOp = { id: evaluated.id }
    if (evaluated.name !== undefined) op.name = evaluated.name
    if (evaluated.config !== undefined) op.config = evaluated.config
    if (evaluated.disabled !== undefined) op.disabled = evaluated.disabled
    ops.push(op)
  }

  return { patch: { yaml: yamlStringify(ops, STRINGIFY_OPTIONS), ops }, diagnostics: [] }
}

// Recursively evaluates !!js markers; plain values pass through with their
// key order intact. Evaluation failures throw: a marker is author code, so a
// broken expression is an authoring error (D4), not a document diagnostic -
// the closed diagnostic-code union has no code for it.
function evaluateJsDeep(value: unknown): unknown {
  if (isJsExpr(value)) return evaluateJsExpr(value.__jsExpr)
  if (Array.isArray(value)) return value.map((item) => evaluateJsDeep(item))
  if (value !== null && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) next[key] = evaluateJsDeep(item)
    return next
  }
  return value
}

function evaluateRow(row: Row): Row {
  return evaluateJsDeep(row) as Row
}

function checkUnresolvedTokens(resolved: ResolvedDefinition): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const check = (config: Record<string, unknown>, basePath: string): void => {
    walkConfigStrings(config, basePath, (value, path) => {
      if (value.includes('{{parameters.')) {
        diagnostics.push(
          diagnostic(
            'schema-error',
            path,
            `resolved definition still contains unresolved parameter token in '${value}'`,
          ),
        )
      }
    })
  }
  resolved.delta.insert.forEach((row, index) => {
    if (row.config !== undefined) check(row.config, `delta.insert[${index}].config`)
  })
  resolved.delta.overrides.forEach((entry, index) => {
    if (entry.config !== undefined) check(entry.config, `delta.overrides[${index}].config`)
  })
  return diagnostics
}
