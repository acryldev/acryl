/**
 * The boundary that reads the environment to choose a Blueprint. Kept apart from the pure domain modules so the only
 * `process.env` access in the blueprint context is in one named place.
 *
 * `ACRYL_BLUEPRINT` names a built-in Blueprint id (`acryl.blank`, `acryl.full`); unset means `acryl.full`.
 * `ACRYL_BRAND_NAME` (and the other `ACRYL_BRAND_*` values) rebrand the selected Blueprint without editing any file.
 *
 * @module acryl-harness-runtime/blueprint/selection
 */

import { brandIdentity } from './brand-identity.ts'
import { selectBlueprint, withBrand, type Blueprint } from './blueprint.ts'

const BRAND_ENV: readonly (readonly [string, string])[] = [
  ['ACRYL_BRAND_NAME', 'name'],
  ['ACRYL_BRAND_TAGLINE', 'tagline'],
  ['ACRYL_BRAND_ACCENT', 'accent'],
  ['ACRYL_BRAND_ACCENT_DARK', 'accentDark'],
  ['ACRYL_BRAND_FONT', 'fontFamily'],
  ['ACRYL_BRAND_MARK', 'mark'],
]

export function blueprintFromEnvironment(env: NodeJS.ProcessEnv = process.env): Blueprint {
  const chosen = selectBlueprint(env.ACRYL_BLUEPRINT)
  const overrides = Object.fromEntries(BRAND_ENV.flatMap(([variable, field]) => {
    const value = env[variable]
    return value === undefined || value === '' ? [] : [[field, value]]
  }))
  if (Object.keys(overrides).length === 0) return chosen
  const base = chosen.brand.kind === 'custom' ? chosen.brand.identity : { name: chosen.name }
  return withBrand(chosen, brandIdentity({ ...base, ...overrides }))
}
