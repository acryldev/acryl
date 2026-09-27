// resolveDefinition: parameter substitution and single-parent extends
// applied bottom-up (FR-007, FR-013, FR-014, FR-015). Every failure is a
// diagnostic; nothing throws for invalid input. The resolved definition
// keeps the delta this definition contributed so compile can emit the
// per-definition patch (FR-016).
import { diagnostic, joinField, joinIndex, type Diagnostic } from './diagnostics.js'
import type {
  BlendDocument,
  OverrideEntry,
  ParameterDeclaration,
  ParameterValue,
  ResolvedDelta,
  ResolvedDefinition,
  Row,
} from './document.js'
import { substituteConfig } from './parameters.js'
import { validateDefinition } from './validate.js'

export interface ResolveOptions {
  /** Parameter values for the root document; parents resolve with defaults. */
  overrides?: Record<string, unknown>
  /** Supplies parent documents by id; callers own the definition set. */
  getDefinition?: (id: string) => BlendDocument | undefined
}

export interface ResolveResult {
  definition: ResolvedDefinition | null
  diagnostics: Diagnostic[]
}

export function resolveDefinition(document: BlendDocument, options: ResolveOptions = {}): ResolveResult {
  return resolveChain(document, options, new Set([document.metadata.id]))
}

function resolveChain(
  doc: BlendDocument,
  options: ResolveOptions,
  chain: Set<string>,
): ResolveResult {
  // Cheap re-check so a caller that skipped validation gets diagnostics
  // instead of undefined behavior. Local-authoring mode: resolution must
  // accept !!js content; compile evaluates it (D4).
  const recheck = validateDefinition(doc, 'local-authoring')
  if (recheck.length > 0) return { definition: null, diagnostics: recheck }

  const diagnostics: Diagnostic[] = []
  const values = collectParameterValues(doc.spec.parameters ?? {}, options.overrides, diagnostics)
  const insertRows = (doc.spec.rows ?? []).map((row) => substituteRow(row, values))
  const overrideEntries = (doc.spec.overrides ?? []).map((entry) => substituteOverride(entry, values))

  const parentId = parentOf(doc)
  let parentRows: Row[] | null = null
  if (parentId !== undefined) {
    if (chain.has(parentId)) {
      diagnostics.push(
        diagnostic(
          'parent-cycle',
          parentRefPath(doc),
          `parent '${parentId}' closes a cycle in the resolution chain`,
        ),
      )
    } else {
      const parentDoc = options.getDefinition?.(parentId)
      if (parentDoc === undefined) {
        diagnostics.push(
          diagnostic(
            'parent-not-supplied',
            parentRefPath(doc),
            `parent '${parentId}' is not supplied by getDefinition`,
          ),
        )
      } else {
        // Parents resolve with their own declared defaults: options.overrides
        // answer the root document's parameters (v0.1 scope).
        const parent = resolveChain(
          parentDoc,
          { getDefinition: options.getDefinition },
          new Set(chain).add(parentId),
        )
        diagnostics.push(...parent.diagnostics)
        parentRows = parent.definition?.spec.rows ?? null
      }
    }
  }

  if (parentRows !== null) {
    const parentIds = new Set(parentRows.map((row) => row.id))
    for (const [index, entry] of overrideEntries.entries()) {
      if (!parentIds.has(entry.id)) {
        diagnostics.push(
          diagnostic(
            'override-unknown-id',
            joinField(joinIndex('spec.overrides', index), 'id'),
            `override targets row id '${entry.id}' which is absent from the resolved parent`,
          ),
        )
      }
    }
    for (const [index, row] of insertRows.entries()) {
      if (parentIds.has(row.id)) {
        diagnostics.push(
          diagnostic(
            'insert-id-collision',
            joinField(joinIndex('spec.rows', index), 'id'),
            `row id '${row.id}' already exists in the resolved parent`,
          ),
        )
      }
    }
  }

  if (diagnostics.length > 0) return { definition: null, diagnostics }

  if (parentRows === null) {
    // Root definition: every row is a new row; the delta is the full list.
    const delta: ResolvedDelta = { insert: insertRows, overrides: [] }
    return { definition: assemble(doc, insertRows, delta), diagnostics: [] }
  }

  const overrideById = new Map(overrideEntries.map((entry) => [entry.id, entry]))
  const inherited = parentRows.map((row) => {
    const entry = overrideById.get(row.id)
    return entry === undefined ? row : mergeOverride(row, entry)
  })
  const delta: ResolvedDelta = { insert: insertRows, overrides: overrideEntries }
  return { definition: assemble(doc, [...inherited, ...insertRows], delta), diagnostics: [] }
}

// A definition's resolution parent: explicit extends, else - for a Blend -
// its lineage origin (a Blend may declare lineage without extends, as
// acme.crm does; ledger amendment pending at T016).
function parentOf(doc: BlendDocument): string | undefined {
  return resolutionParentOf(doc)
}

/** The id of the definition `doc` resolves over, or undefined for a root. */
export function resolutionParentOf(document: BlendDocument): string | undefined {
  if (document.spec.extends !== undefined) return document.spec.extends
  if (document.kind === 'Blend' && document.spec.lineage !== undefined) {
    return document.spec.lineage.blueprint
  }
  return undefined
}

function parentRefPath(doc: BlendDocument): string {
  return doc.spec.extends !== undefined ? 'spec.extends' : 'spec.lineage.blueprint'
}

// Start from declared defaults, then apply the caller's overrides after
// validating each one against the declaration (FR-006).
function collectParameterValues(
  declared: Record<string, ParameterDeclaration>,
  overrides: Record<string, unknown> | undefined,
  diagnostics: Diagnostic[],
): Record<string, ParameterValue> {
  const values: Record<string, ParameterValue> = {}
  for (const [name, declaration] of Object.entries(declared)) values[name] = declaration.default
  if (overrides !== undefined) {
    for (const [name, value] of Object.entries(overrides)) {
      const path = joinField('options.overrides', name)
      if (!Object.hasOwn(declared, name)) {
        diagnostics.push(
          diagnostic(
            'parameter-override-unknown',
            path,
            `override for parameter '${name}' is not declared in spec.parameters`,
          ),
        )
        continue
      }
      const declaration = declared[name]
      if (declaration === undefined || typeof value !== declaration.type) {
        diagnostics.push(
          diagnostic(
            'parameter-type-mismatch',
            path,
            `override for parameter '${name}' must be of type '${declaration?.type ?? 'unknown'}', got '${typeof value}'`,
          ),
        )
        continue
      }
      values[name] = value as ParameterValue
    }
  }
  return values
}

// Substituted rows keep the canonical key order (id, name, config, disabled)
// so downstream YAML emission is insertion-ordered and deterministic.
function substituteRow(row: Row, values: Record<string, ParameterValue>): Row {
  return {
    id: row.id,
    name: row.name,
    ...(row.config !== undefined ? { config: substituteConfig(row.config, values) } : {}),
    ...(row.disabled !== undefined ? { disabled: row.disabled } : {}),
  }
}

function substituteOverride(
  entry: OverrideEntry,
  values: Record<string, ParameterValue>,
): OverrideEntry {
  return {
    id: entry.id,
    ...(entry.name !== undefined ? { name: entry.name } : {}),
    ...(entry.config !== undefined ? { config: substituteConfig(entry.config, values) } : {}),
    ...(entry.disabled !== undefined ? { disabled: entry.disabled } : {}),
  }
}

// Shallow per-key merge (D13): keys the override sets win, keys it omits
// inherit. No key removal, no deep merge. Returns a new row; the parent's
// row objects are never mutated (one parent document can serve many
// children).
function mergeOverride(row: Row, entry: OverrideEntry): Row {
  return {
    id: row.id,
    ...(entry.name !== undefined ? { name: entry.name } : { name: row.name }),
    ...(entry.config !== undefined
      ? { config: { ...row.config, ...entry.config } }
      : row.config !== undefined
        ? { config: row.config }
        : {}),
    ...(entry.disabled !== undefined
      ? { disabled: entry.disabled }
      : row.disabled !== undefined
        ? { disabled: row.disabled }
        : {}),
  }
}

function assemble(doc: BlendDocument, rows: Row[], delta: ResolvedDelta): ResolvedDefinition {
  return {
    apiVersion: doc.apiVersion,
    kind: doc.kind,
    metadata: doc.metadata,
    spec: {
      runtime: doc.spec.runtime,
      ...(doc.spec.lineage !== undefined ? { lineage: doc.spec.lineage } : {}),
      rows,
    },
    delta,
  }
}
