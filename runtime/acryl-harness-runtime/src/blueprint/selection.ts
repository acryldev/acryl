/**
 * The boundary that reads the environment to choose a Blueprint. Kept apart from the pure domain modules so the only
 * `process.env` access in the blueprint context is in one named place.
 *
 * `ACRYL_BLUEPRINT` names a built-in Blueprint id (`acryl.blank`, `acryl.ide`) or a `.yaml`, `.yml` or `.json` file that defines one
 * (see `definition.ts`); unset means `acryl.ide`.
 * `ACRYL_BRAND_NAME` (and the other `ACRYL_BRAND_*` values) rebrand the selected Blueprint without editing any file.
 *
 * @module acryl-harness-runtime/blueprint/selection
 */

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parse } from 'yaml'
import { brandIdentity } from './brand-identity.ts'
import { selectBlueprint, withBrand, type Blueprint } from './blueprint.ts'
import { InvalidBlueprintError, parseBlueprint } from './definition.ts'
import { blueprintFromManifest, isBlendsManifest } from './manifest.ts'

const BRAND_ENV: readonly (readonly [string, string])[] = [
  ['ACRYL_BRAND_NAME', 'name'],
  ['ACRYL_BRAND_TAGLINE', 'tagline'],
  ['ACRYL_BRAND_ACCENT', 'accent'],
  ['ACRYL_BRAND_ACCENT_DARK', 'accentDark'],
  ['ACRYL_BRAND_FONT', 'fontFamily'],
  ['ACRYL_BRAND_MARK', 'mark'],
]

const BLUEPRINT_FILE_EXTENSIONS = new Set(['.yaml', '.yml', '.json'])

/** Read and validate a Blueprint file. A missing or malformed file fails loudly: a silent fallback would boot the wrong product. */
export function readBlueprintFile(path: string): Blueprint {
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch (cause) {
    throw new InvalidBlueprintError(`cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  let data: unknown
  try {
    data = parse(source)
  } catch (cause) {
    throw new InvalidBlueprintError(`${path} is not valid YAML: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`)
  }
  // An app's `blend.yaml` is a Blends manifest; a short runtime definition is also accepted.
  return isBlendsManifest(data) ? blueprintFromManifest(data) : parseBlueprint(data)
}

export function blueprintFromEnvironment(env: NodeJS.ProcessEnv = process.env): Blueprint {
  const selected = env.ACRYL_BLUEPRINT?.trim()
  const chosen = selected !== undefined && BLUEPRINT_FILE_EXTENSIONS.has(extname(selected).toLowerCase())
    ? readBlueprintFile(selected)
    : selectBlueprint(env.ACRYL_BLUEPRINT)
  const overrides = Object.fromEntries(BRAND_ENV.flatMap(([variable, field]) => {
    const value = env[variable]
    return value === undefined || value === '' ? [] : [[field, value]]
  }))
  if (Object.keys(overrides).length === 0) return chosen
  const base = chosen.brand.kind === 'custom' ? chosen.brand.identity : { name: chosen.name }
  return withBrand(chosen, brandIdentity({ ...base, ...overrides }))
}
