/**
 * `acryl doctor` and `acryl repair`: the terminal surface of the shared offline rescue services (spec 041,
 * Scope B). They read files and logs and change one small file at a time, with a backup, so they work when the
 * app is too broken to start. They never import the app.
 *
 * @module acryl-cli/host/rescue-command
 */

import {
  SAFE_RECIPES,
  applyRepairPlan,
  describePlan,
  inspectProfile,
  isSafeRecipe,
  planRepairs,
  resolveAcrylDshHome,
  undoRepair,
  type ProfileDiagnosis,
  type RecipeId,
  type RepairPlan,
  type RepairResult,
} from 'acryl-harness-runtime'

export interface RescueOptions {
  readonly profile: string
  /** The engine home; defaults to the one `$ACRYL_HOME` / `$DSH_HOME` resolve to. */
  readonly home?: string
}

export interface RepairOptions extends RescueOptions {
  readonly dryRun: boolean
  readonly yes: boolean
  readonly recipes: readonly string[]
  readonly undo?: string
}

/** Asks the person to confirm; false for anything but a clear yes. Injected so tests never wait on a terminal. */
export type Confirm = (question: string) => Promise<boolean>

export type RescueResult =
  | { readonly kind: 'diagnosis'; readonly diagnosis: ProfileDiagnosis }
  | { readonly kind: 'plan'; readonly diagnosis: ProfileDiagnosis; readonly plan: RepairPlan; readonly text: string }
  | { readonly kind: 'repaired'; readonly diagnosis: ProfileDiagnosis; readonly plan: RepairPlan; readonly result: RepairResult }
  | { readonly kind: 'undone'; readonly backupId: string; readonly files: readonly string[] }
  | { readonly kind: 'declined'; readonly plan: RepairPlan; readonly reason: string }

const homeOf = (options: RescueOptions): string => options.home ?? resolveAcrylDshHome()

export function runDoctor(options: RescueOptions): RescueResult {
  return { kind: 'diagnosis', diagnosis: inspectProfile({ dshHome: homeOf(options), profileName: options.profile }) }
}

function chosenRecipes(names: readonly string[]): RecipeId[] {
  const bad = names.find(name => !isSafeRecipe(name))
  if (bad !== undefined) throw new Error(`unknown recipe ${JSON.stringify(bad)}; the recipes are ${SAFE_RECIPES.join(', ')}`)
  return names.length === 0 ? [...SAFE_RECIPES] : names.filter(isSafeRecipe)
}

/**
 * Diagnose, plan, and (unless a dry run) apply the safe repairs. Three tiers: a dry run only prints; an
 * attended run asks first; an unattended run (`yes`) needs the recipes named, so it does only what was listed.
 */
export async function runRepair(options: RepairOptions, confirm: Confirm): Promise<RescueResult> {
  const dshHome = homeOf(options)
  if (options.undo !== undefined) {
    const manifest = await undoRepair(dshHome, options.undo)
    return { kind: 'undone', backupId: manifest.id, files: manifest.entries.map(entry => entry.path) }
  }
  const diagnosis = inspectProfile({ dshHome, profileName: options.profile })
  const plan = planRepairs(diagnosis, chosenRecipes(options.recipes))
  if (options.dryRun || plan.steps.length === 0) return { kind: 'plan', diagnosis, plan, text: describePlan(plan) }
  if (!options.yes && !(await confirm(`${describePlan(plan)}\nApply these changes? Each file is backed up first. [y/N] `))) {
    return { kind: 'declined', plan, reason: 'not confirmed; nothing was changed' }
  }
  const result = await applyRepairPlan(plan)
  return { kind: 'repaired', diagnosis, plan, result }
}
