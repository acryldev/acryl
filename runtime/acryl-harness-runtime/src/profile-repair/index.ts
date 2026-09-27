/** Offline diagnosis and repair of a profile (spec 041, Scope B): static, reversible, and safe to run when the app cannot start. */

export { createBackup, listBackups, restoreBackup, backupsDir } from './backup.ts'
export type { BackupEntry, BackupManifest } from './backup.ts'
export { SAFE_RECIPES, isSafeRecipe } from './findings.ts'
export type { ProfileDiagnosis, ProfileFinding, ProfileFindingCode, RecipeId } from './findings.ts'
export { inspectProfile } from './inspector.ts'
export type { InspectOptions } from './inspector.ts'
export { applyRepairPlan, describePlan, planRepairs, undoRepair } from './repair.ts'
export type { RepairPlan, RepairResult, RepairStep } from './repair.ts'
