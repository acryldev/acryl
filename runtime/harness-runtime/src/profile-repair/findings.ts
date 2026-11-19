/** What a static diagnosis of a profile can say, and what repairs exist for it. */

export type ProfileFindingCode =
  | 'profile-missing'
  | 'state-unreadable'
  | 'profile-manifest-unreadable'
  | 'bundle-missing'
  | 'pnpm-layout-mismatch'
  | 'plugin-activation-failed'
  | 'pnpm-store-mismatch'

/**
 * The repairs that may ever run without a person choosing each step. The list is short on purpose: it grows
 * only by a reviewed change (spec 041, question 6).
 */
export const SAFE_RECIPES = ['restore-override-file', 'disable-failing-row'] as const
export type RecipeId = (typeof SAFE_RECIPES)[number]

export interface ProfileFinding {
  /** `error` means the profile is broken; `warning` means it is surprising or degraded. */
  readonly severity: 'error' | 'warning'
  readonly code: ProfileFindingCode
  readonly message: string
  /** The file the finding is about. */
  readonly file?: string
  /** The Loader row or package it is about. */
  readonly entryId?: string
  /** The safe recipe that addresses it, when there is one. */
  readonly recipe?: RecipeId
  /** What a person should do when no safe recipe applies. */
  readonly guidance?: string
}

export interface ProfileDiagnosis {
  readonly profileName: string
  readonly profileDir: string
  readonly dshHome: string
  readonly findings: readonly ProfileFinding[]
}

export function isSafeRecipe(value: string): value is RecipeId {
  return (SAFE_RECIPES as readonly string[]).includes(value)
}
