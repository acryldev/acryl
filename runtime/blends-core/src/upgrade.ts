// planUpgrade / applyUpgrade: what it means to move a Blend to a newer version of its Blueprint.
//
// A Blend records its origin in `spec.lineage` (Blueprint id and version) but the format says nothing about an upgrade. The rule here:
// an upgrade is a PLAN before it is an action.
//
//  1. Resolve the Blend over the old Blueprint and over the new one, with `resolveDefinition` (so the conflicts are the diagnostics the
//     format already has: `override-unknown-id`, `insert-id-collision`; no second set of rules).
//  2. Report what the Blueprint changed, which of those changes the Blend's overrides hide, how the rows the Blend resolves to differ,
//     and the conflicts. Only a plan without conflicts is `safe`.
//  3. Applying a safe plan moves `spec.lineage.blueprintVersion` and nothing else, keeping the file's comments and layout. The rows come
//     from the Blueprint at resolution time, so nothing is copied into the Blend.
//
// Pure like the rest of this package: documents in, a plan out; applying takes the file's text and returns the new text. Every failure
// is a diagnostic; nothing throws for invalid input.
import { parseDocument } from 'yaml'

import { diagnostic, type Diagnostic } from './diagnostics.js'
import type { BlendDocument, Row } from './document.js'
import { resolveDefinition } from './resolve.js'

export type RowField = 'name' | 'config' | 'disabled'

export interface RowChange {
  id: string
  change: 'added' | 'removed' | 'changed'
  /** For a changed row: which fields differ. */
  fields?: RowField[]
}

export interface UpgradePlan {
  /** The Blueprint's definition id. */
  blueprint: string
  /** The version the Blend's lineage says, and the version it would move to. */
  from: string
  to: string
  /** What changed in the Blueprint between the two versions. */
  blueprintChanges: RowChange[]
  /** What the Blend can no longer do on the new Blueprint: resolution diagnostics, with their paths in the Blend. */
  conflicts: Diagnostic[]
  /** Blueprint changes that the Blend's overrides hide, because an override sets the same key. */
  shadowed: Array<{ id: string; keys: string[] }>
  /** How the rows the Blend resolves to differ after the upgrade. Empty when there are conflicts. */
  appChanges: RowChange[]
  /** No conflicts: the Blend resolves cleanly over the new Blueprint. */
  safe: boolean
}

export interface UpgradeInput {
  blend: BlendDocument
  oldBlueprint: BlendDocument
  newBlueprint: BlendDocument
  /** Supplies the parents of either Blueprint, if they have any. */
  getDefinition?: (id: string) => BlendDocument | undefined
  /** Parameter values for the Blend (the Blueprints resolve with their defaults). */
  parameters?: Record<string, unknown>
}

export interface UpgradeResult {
  plan: UpgradePlan | null
  diagnostics: Diagnostic[]
}

export function planUpgrade(input: UpgradeInput): UpgradeResult {
  const { blend, oldBlueprint, newBlueprint } = input
  const lineage = blend.spec.lineage
  if (blend.kind !== 'Blend' || lineage === undefined) {
    return {
      plan: null,
      diagnostics: [
        diagnostic(
          'upgrade-not-a-blend',
          'kind',
          `'${blend.metadata.id}' is a ${blend.kind}; an upgrade applies to a Blend (it needs spec.lineage)`,
        ),
      ],
    }
  }
  const mismatches: Diagnostic[] = []
  for (const [label, definition] of [
    ['oldBlueprint', oldBlueprint],
    ['newBlueprint', newBlueprint],
  ] as const) {
    if (definition.metadata.id !== lineage.blueprint) {
      mismatches.push(
        diagnostic(
          'upgrade-blueprint-mismatch',
          `${label}.metadata.id`,
          `${label} is '${definition.metadata.id}' but the Blend is made from '${lineage.blueprint}'`,
        ),
      )
    }
  }
  if (oldBlueprint.metadata.version !== lineage.blueprintVersion) {
    mismatches.push(
      diagnostic(
        'upgrade-version-mismatch',
        'oldBlueprint.metadata.version',
        `oldBlueprint is version ${oldBlueprint.metadata.version} but the Blend's lineage says ${lineage.blueprintVersion}`,
      ),
    )
  }
  if (mismatches.length > 0) return { plan: null, diagnostics: mismatches }

  const serving = (blueprint: BlendDocument) => (id: string) =>
    id === lineage.blueprint ? blueprint : input.getDefinition?.(id)
  const own = { getDefinition: input.getDefinition }
  const oldBlueprintRows = resolveDefinition(oldBlueprint, own)
  const newBlueprintRows = resolveDefinition(newBlueprint, own)
  const parameters = input.parameters
  const before = resolveDefinition(blend, {
    getDefinition: serving(oldBlueprint),
    ...(parameters ? { overrides: parameters } : {}),
  })
  const failed = [oldBlueprintRows, newBlueprintRows, before].flatMap((result) => result.diagnostics)
  if (
    oldBlueprintRows.definition === null ||
    newBlueprintRows.definition === null ||
    before.definition === null
  ) {
    return { plan: null, diagnostics: failed }
  }
  // The new Blueprint may well break the Blend: that is a conflict in the plan, not a failure to plan.
  const after = resolveDefinition(blend, {
    getDefinition: serving(newBlueprint),
    ...(parameters ? { overrides: parameters } : {}),
  })

  const blueprintChanges = diffRows(oldBlueprintRows.definition.spec.rows, newBlueprintRows.definition.spec.rows)
  const changedFields = new Map(
    blueprintChanges.filter((change) => change.change === 'changed').map((change) => [change.id, change.fields ?? []]),
  )
  const shadowed = (blend.spec.overrides ?? []).flatMap((entry) => {
    const fields = changedFields.get(entry.id)
    if (fields === undefined) return []
    const keys = [
      ...(fields.includes('name') && entry.name !== undefined ? ['name'] : []),
      ...(fields.includes('disabled') && entry.disabled !== undefined ? ['disabled'] : []),
      ...(fields.includes('config') && entry.config !== undefined ? Object.keys(entry.config) : []),
    ]
    return keys.length > 0 ? [{ id: entry.id, keys }] : []
  })

  const conflicts = after.diagnostics
  return {
    plan: {
      blueprint: lineage.blueprint,
      from: lineage.blueprintVersion,
      to: newBlueprint.metadata.version,
      blueprintChanges,
      conflicts,
      shadowed,
      appChanges: after.definition === null ? [] : diffRows(before.definition.spec.rows, after.definition.spec.rows),
      safe: conflicts.length === 0,
    },
    diagnostics: [],
  }
}

export interface ApplyResult {
  /** The Blend's new text, or null when the plan could not be applied. */
  source: string | null
  diagnostics: Diagnostic[]
}

/**
 * Move `spec.lineage.blueprintVersion` from the plan's `from` to its `to`, in the Blend's source text. Nothing else changes: comments,
 * order and `!!js` expressions are kept (the text is edited as a document, with unknown tags left as written).
 */
export function applyUpgrade(source: string, plan: UpgradePlan): ApplyResult {
  if (!plan.safe) {
    return {
      source: null,
      diagnostics: [
        diagnostic(
          'upgrade-conflicts',
          'plan.conflicts',
          `the upgrade to ${plan.to} has ${plan.conflicts.length} conflict(s); resolve them first`,
        ),
      ],
    }
  }
  const document = parseDocument(source)
  if (document.errors.length > 0) {
    return {
      source: null,
      diagnostics: document.errors.map((error) => diagnostic('parse-error', '$', String(error.message))),
    }
  }
  const current = document.getIn(['spec', 'lineage', 'blueprintVersion'])
  if (current !== plan.from) {
    return {
      source: null,
      diagnostics: [
        diagnostic(
          'upgrade-stale-plan',
          'spec.lineage.blueprintVersion',
          `the Blend says ${String(current)} but the plan was made from ${plan.from}; plan again`,
        ),
      ],
    }
  }
  document.setIn(['spec', 'lineage', 'blueprintVersion'], plan.to)
  return { source: String(document), diagnostics: [] }
}

function diffRows(before: Row[], after: Row[]): RowChange[] {
  const changes: RowChange[] = []
  const was = new Map(before.map((row) => [row.id, row]))
  const is = new Map(after.map((row) => [row.id, row]))
  for (const row of before) if (!is.has(row.id)) changes.push({ id: row.id, change: 'removed' })
  for (const row of after) {
    const old = was.get(row.id)
    if (old === undefined) {
      changes.push({ id: row.id, change: 'added' })
      continue
    }
    const fields: RowField[] = []
    if (old.name !== row.name) fields.push('name')
    if (!sameValue(old.config ?? {}, row.config ?? {})) fields.push('config')
    if ((old.disabled ?? false) !== (row.disabled ?? false)) fields.push('disabled')
    if (fields.length > 0) changes.push({ id: row.id, change: 'changed', fields })
  }
  return changes
}

// Structural equality for config values: plain data, `!!js` markers included (they are plain objects with one key).
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  }
  return false
}
