/**
 * Repair recipes and the plan that runs them.
 *
 * A recipe is a named step with a precondition, a dry-run description that names the exact files it will
 * change, and an undo through the pre-image backup. Nothing is guessed: with no matching finding a recipe does
 * not exist in the plan. There are only two recipes and they can only grow by a reviewed change.
 */

import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '../engine-files.ts'
import {
  entryPatchId,
  readDisabledPluginLifecycleEntries,
  resolvePluginLifecycleStatePath,
  setPluginLifecycleEntryEnabled,
} from '../plugin-lifecycle-state.ts'
import { createBackup, listBackups, readPreImage, restoreBackup, type BackupManifest } from './backup.ts'
import { SAFE_RECIPES, type ProfileDiagnosis, type ProfileFinding, type RecipeId } from './findings.ts'

export interface RepairStep {
  readonly recipe: RecipeId
  /** What will change, in words, naming the file or row. */
  readonly description: string
  /** Every file the step may write; each is backed up first. */
  readonly files: readonly string[]
  /** The finding that made this step applicable. */
  readonly because: ProfileFinding
}

export interface RepairPlan {
  readonly profileName: string
  readonly dshHome: string
  readonly steps: readonly RepairStep[]
}

export interface RepairResult {
  readonly backupId: string
  readonly applied: readonly RecipeId[]
}

const EMPTY_STATE = `${JSON.stringify({ version: 1, profiles: [] }, null, 2)}\n`

/** Whether a stored override file still parses under the current rules. */
function isValidState(dshHome: string, profileName: string, text: string): boolean {
  const probe = join(dshHome, '.repair-probe-state.json')
  try {
    // The reader takes a path, so a parseable copy is judged through the same function the app uses.
    writeFileSync(probe, text)
    readDisabledPluginLifecycleEntries({ profileName, statePath: probe })
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { force: true })
  }
}


/** The newest backed-up copy of the override file that is valid, if any. */
function lastValidOverride(dshHome: string, profileName: string, statePath: string): string | undefined {
  for (const manifest of listBackups(dshHome)) {
    for (const entry of manifest.entries) {
      if (entry.path !== statePath || !entry.existed) continue
      try {
        const text = readPreImage(dshHome, manifest, entry).toString('utf8')
        if (isValidState(dshHome, profileName, text)) return text
      } catch {
        // A damaged backup is skipped; an older one may be fine.
      }
    }
  }
  return undefined
}

/**
 * Build the plan for the chosen recipes.
 * @param recipes - the recipes to include; only ones with a matching finding are planned.
 */
export function planRepairs(diagnosis: ProfileDiagnosis, recipes: readonly RecipeId[] = SAFE_RECIPES): RepairPlan {
  const statePath = resolvePluginLifecycleStatePath(diagnosis.dshHome)
  const steps: RepairStep[] = []
  for (const finding of diagnosis.findings) {
    if (finding.recipe === undefined || !recipes.includes(finding.recipe)) continue
    if (finding.recipe === 'restore-override-file') {
      const previous = lastValidOverride(diagnosis.dshHome, diagnosis.profileName, statePath)
      steps.push({
        recipe: 'restore-override-file', because: finding, files: [statePath],
        description: previous === undefined
          ? `Replace the unreadable ${statePath} with an empty override file (no plugin is recorded as disabled). The damaged file is kept in the backup.`
          : `Replace the unreadable ${statePath} with the last valid copy from a backup. The damaged file is kept in the new backup.`,
      })
    } else if (finding.entryId !== undefined) {
      steps.push({
        recipe: 'disable-failing-row', because: finding, files: [statePath],
        description: `Record ${finding.entryId} as disabled for profile ${JSON.stringify(diagnosis.profileName)} in ${statePath}, so the app starts without it. Nothing is uninstalled.`,
      })
    }
  }
  // The override file must be readable before a row can be recorded in it.
  steps.sort((a, b) => Number(b.recipe === 'restore-override-file') - Number(a.recipe === 'restore-override-file'))
  return { profileName: diagnosis.profileName, dshHome: diagnosis.dshHome, steps }
}

/** Back up, then apply every step; on any failure the backup is put back and the error is thrown. */
export async function applyRepairPlan(plan: RepairPlan): Promise<RepairResult> {
  if (plan.steps.length === 0) throw new Error('there is nothing to repair')
  const statePath = resolvePluginLifecycleStatePath(plan.dshHome)
  const files = [...new Set(plan.steps.flatMap(step => step.files))]
  const backup: BackupManifest = await createBackup({ dshHome: plan.dshHome, profileName: plan.profileName, recipes: plan.steps.map(step => step.recipe), files })
  try {
    for (const step of plan.steps) {
      if (step.recipe === 'restore-override-file') {
        const previous = lastValidOverride(plan.dshHome, plan.profileName, statePath)
        await writeFileAtomic(statePath, previous ?? EMPTY_STATE, { mode: 0o600, dirMode: 0o700 })
      } else if (step.because.entryId !== undefined) {
        await setPluginLifecycleEntryEnabled({ profileName: plan.profileName, statePath }, entryPatchId(step.because.entryId), false)
      }
    }
  } catch (cause) {
    await restoreBackup(plan.dshHome, backup.id)
    throw new Error(`the repair failed and was rolled back: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  return { backupId: backup.id, applied: plan.steps.map(step => step.recipe) }
}

/** Undo a repair by putting its pre-images back. */
export async function undoRepair(dshHome: string, backupId: string): Promise<BackupManifest> {
  return restoreBackup(dshHome, backupId)
}

/** The plan as readable text, for a dry run or a confirmation. */
export function describePlan(plan: RepairPlan): string {
  if (plan.steps.length === 0) return 'Nothing to repair.'
  return plan.steps.map((step, index) => `${String(index + 1)}. [${step.recipe}] ${step.description}`).join('\n')
}

