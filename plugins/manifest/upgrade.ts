/**
 * Upgrading a Blend: what happens when its Blueprint moves to a new version. The plan and its application are ACRYL's own
 * (`@webboxes/blends-core`); this file only reads the Blend and the two Blueprint files and keeps the terminal output.
 *
 * An upgrade is a *plan* before it is an action: what the Blueprint changed, what the Blend can no longer do on it (conflicts),
 * which changes its overrides hide, and how the rows the app mounts would differ. Only a plan with no conflicts is `safe`.
 * Applying it moves `spec.lineage.blueprintVersion` and nothing else, keeping the file's comments.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  applyUpgrade as applyToSource,
  type BlendDocument,
  type Diagnostic,
  parseDefinition,
  planUpgrade as planFromDocuments,
  type RowChange,
  type UpgradePlan,
} from '@webboxes/blends-core'
import type { LoadOptions } from './index.ts'

export type { RowChange, UpgradePlan }

const refusal = (diagnostics: readonly Diagnostic[], file?: string) =>
  new Error(
    `${file ? `${file}:\n` : ''}${diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n')}`,
  )

function read(file: string): BlendDocument {
  const { document, diagnostics } = parseDefinition(readFileSync(file, 'utf8'))
  if (diagnostics.length > 0) throw refusal(diagnostics, file)
  return document as BlendDocument
}

/**
 * Plan the upgrade of the Blend in `blendFile` from the Blueprint file it was made from (`oldBlueprint`) to a newer one
 * (`newBlueprint`). `getBlueprint` finds the parents of either Blueprint, if they have any. Throws for input that cannot be read
 * as a plan: a Blueprint file with the wrong id, an old Blueprint whose version is not the Blend's lineage version, or a document
 * that is not a Blend. Everything the upgrade would break is in the plan.
 */
export function planUpgrade(options: {
  blendFile: string
  oldBlueprint: string
  newBlueprint: string
  getBlueprint?: LoadOptions['getBlueprint']
  values?: LoadOptions['values']
}): UpgradePlan {
  const getDefinition = options.getBlueprint
    ? (id: string) => {
        const file = options.getBlueprint?.(id)
        return file === undefined ? undefined : read(file)
      }
    : undefined
  const { plan, diagnostics } = planFromDocuments({
    blend: read(options.blendFile),
    oldBlueprint: read(options.oldBlueprint),
    newBlueprint: read(options.newBlueprint),
    ...(getDefinition ? { getDefinition } : {}),
    ...(options.values ? { parameters: options.values } : {}),
  })
  if (plan === null) throw refusal(diagnostics)
  return plan
}

/** Move the Blend's lineage to the plan's new version, keeping the file's comments and layout. Refuses an unsafe plan. */
export function applyUpgrade(blendFile: string, plan: UpgradePlan): void {
  const { source, diagnostics } = applyToSource(readFileSync(blendFile, 'utf8'), plan)
  if (source === null) throw refusal(diagnostics)
  writeFileSync(blendFile, source)
}

/** A short, readable account of a plan, for a terminal. */
export function describePlan(plan: UpgradePlan): string {
  const line = (change: RowChange) =>
    `  ${change.change.padEnd(7)} ${change.id}${change.fields ? ` (${change.fields.join(', ')})` : ''}`
  const lines = [`${plan.blueprint}: ${plan.from} -> ${plan.to}`]
  lines.push(
    plan.blueprintChanges.length ? 'the Blueprint changed:' : 'the Blueprint has no row changes',
    ...plan.blueprintChanges.map(line),
  )
  if (plan.shadowed.length)
    lines.push(
      'your overrides hide some of that:',
      ...plan.shadowed.map((entry) => `  ${entry.id}: ${entry.keys.join(', ')}`),
    )
  if (plan.conflicts.length)
    lines.push(
      'this Blend would break:',
      ...plan.conflicts.map((conflict) => `  ${conflict.path}: ${conflict.message}`),
    )
  else
    lines.push(
      plan.appChanges.length ? 'your app would change:' : 'your app would not change',
      ...plan.appChanges.map(line),
    )
  lines.push(plan.safe ? 'safe to apply' : 'NOT safe: resolve the conflicts first')
  return lines.join('\n')
}
