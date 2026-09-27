/**
 * The app definition file (`blend.yaml`) is a Blends manifest (`blends.acryl.dev/v1alpha1`), so one file is both what the Blends tooling reads, captures
 * and publishes and what this runtime boots from. The format itself (schema, structural rules, lineage) is validated by `@acryl/blends-core`, the one
 * reader of the format; this module is only the translation between the two vocabularies, pure and in both directions:
 *
 *   manifest -> Blueprint   `kind: Blend` grows from `spec.lineage.blueprint` (a known Blueprint); `kind: Blueprint` names one. Rows whose package is one of
 *                           ACRYL's own rows turn that capability on (or off with `disabled: true`); the `acryl-brand` row's config is the brand. Any other
 *                           row is an app plugin: it lives in the app's `extensions/` and loads from there, so the Blueprint does not compose it.
 *   Blueprint -> manifest   what `acryl new` writes.
 *
 * @module acryl-harness-runtime/blueprint/manifest
 */

import { validateDefinition } from '@acryl/blends-core'
import { brandIdentity, type BrandIdentity } from './brand-identity.ts'
import { builtInCatalog, type Blueprint, type BlueprintCatalog, type BlueprintRowId } from './blueprint.ts'
import { blueprintRowForPackage, packageForBlueprintRow } from './compose.ts'
import { InvalidBlueprintError } from './definition.ts'

export const BLENDS_API_VERSION = 'blends.acryl.dev/v1alpha1'
export const BRAND_PACKAGE = 'acryl-brand'

const ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u

interface ManifestRow {
  readonly id: string
  readonly name: string
  readonly config?: Record<string, unknown>
  readonly disabled?: boolean
}

export function isBlendsManifest(input: unknown): boolean {
  return input !== null && typeof input === 'object' && (input as Record<string, unknown>).apiVersion === BLENDS_API_VERSION
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidBlueprintError(`${what} must be an object`)
  return value as Record<string, unknown>
}

function rowsOf(spec: Record<string, unknown>): readonly ManifestRow[] {
  const rows = spec.rows
  if (rows === undefined) return []
  if (!Array.isArray(rows)) throw new InvalidBlueprintError('"spec.rows" must be a list')
  return rows.map((row, index) => {
    const entry = record(row, `spec.rows[${String(index)}]`)
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') throw new InvalidBlueprintError(`spec.rows[${String(index)}] needs a string id and name`)
    return entry as unknown as ManifestRow
  })
}

/** Turn a parsed Blends manifest into the Blueprint this runtime boots. */
export function blueprintFromManifest(input: unknown, catalog: BlueprintCatalog = builtInCatalog()): Blueprint {
  const document = record(input, 'the manifest')
  if (document.apiVersion !== BLENDS_API_VERSION) throw new InvalidBlueprintError(`apiVersion must be ${BLENDS_API_VERSION}`)
  // The format's own rules first (schema, row ids, lineage), from the format package; `distribution` also refuses executable `!!js` values in an app definition.
  const problems = validateDefinition(input, 'distribution')
  if (problems.length > 0) throw new InvalidBlueprintError(problems.map(problem => `${problem.path}: ${problem.message}`).join('; '))
  const metadata = record(document.metadata, '"metadata"')
  const spec = record(document.spec, '"spec"')
  const id = metadata.id
  if (typeof id !== 'string' || !ID.test(id)) throw new InvalidBlueprintError('"metadata.id" must be a dot-namespaced id such as acryl.blank.orbit')
  const kind = document.kind
  let base: Blueprint | undefined
  if (kind === 'Blueprint') {
    // A built-in Blueprint (the blank canvas), or a starter kit that extends one: accounting, sound stage, video editor...
    // A starter resolves through its parent; only a Blueprint without `extends` is looked up by its own id (a built-in).
    if (typeof spec.extends === 'string') {
      base = catalog.get(spec.extends)
      if (base === undefined) throw new InvalidBlueprintError(`"spec.extends" names ${JSON.stringify(spec.extends)}, which is not a known blueprint (a starter's parent must be built in or kept in the app's blueprints/ folder)`)
    } else base = catalog.get(id)
  } else if (kind === 'Blend') {
    const lineage = record(spec.lineage, '"spec.lineage"')
    if (typeof lineage.blueprint !== 'string') throw new InvalidBlueprintError('"spec.lineage.blueprint" is required for a Blend')
    base = catalog.get(lineage.blueprint)
    if (base === undefined) throw new InvalidBlueprintError(`"spec.lineage.blueprint" names ${JSON.stringify(lineage.blueprint)}, which is not a known blueprint (a project keeps the starter it grew from in its blueprints/ folder)`)
  } else throw new InvalidBlueprintError('"kind" must be Blueprint or Blend')
  if (base === undefined) throw new InvalidBlueprintError(`${JSON.stringify(id)} is not a known blueprint: a starter names its parent with spec.extends, a project names what it grew from with kind: Blend and spec.lineage`)

  const rows = new Set<BlueprintRowId>(base.rows)
  let brand: Blueprint['brand'] = base.brand
  for (const row of rowsOf(spec)) {
    if (row.name === BRAND_PACKAGE) {
      brand = row.disabled === true ? { kind: 'acryl' } : { kind: 'custom', identity: brandIdentity(row.config ?? {}) }
      continue
    }
    const known = blueprintRowForPackage(row.name)
    if (known === undefined) continue   // an app plugin: loaded from the app's extensions/, not composed here
    if (row.disabled === true) rows.delete(known)
    else rows.add(known)
  }
  return Object.freeze({
    ...base,
    id,
    name: typeof metadata.name === 'string' && metadata.name.trim() !== '' ? metadata.name.trim() : base.name,
    description: typeof metadata.description === 'string' ? metadata.description : base.description,
    rows: [...rows],
    brand,
  })
}

/** The manifest `acryl new` writes: a Blend grown from `blueprint`, carrying the brand as a row. */
export function appManifest(input: { id: string, name: string, blueprint: Blueprint, brand: BrandIdentity, description?: string }): Record<string, unknown> {
  const brandRow = { id: 'brand', name: BRAND_PACKAGE, config: { ...input.brand } }
  return {
    apiVersion: BLENDS_API_VERSION,
    kind: 'Blend',
    // Private and proprietary until the owner says otherwise: saving refuses a public remote for a private app, and a registry refuses to list it.
    metadata: { id: input.id, name: input.name, version: '0.1.0', description: input.description ?? `${input.name}, grown from ${input.blueprint.id}.`, license: 'Proprietary', visibility: 'private' },
    spec: {
      runtime: 'cordis',
      lineage: { blueprint: input.blueprint.id, blueprintVersion: '0.1.0' },
      rows: [brandRow, ...input.blueprint.rows.map(id => { const row = packageForBlueprintRow(id); return { id: row.rowId, name: row.packageName } })],
    },
  }
}

/**
 * The Blueprints an app can grow from: the built-ins, plus the starter definitions it keeps in its `blueprints/` folder (`acryl new --from <starter>` copies
 * the starter there, like a lock of the parent). A starter may extend another starter; each is resolved on first use, and a cycle is refused.
 */
export function catalogWithStarters(starters: ReadonlyArray<{ readonly id: string, readonly document: unknown }>, base: BlueprintCatalog = builtInCatalog()): BlueprintCatalog {
  const resolved = new Map<string, Blueprint>()
  const resolving = new Set<string>()
  const byId = new Map(starters.map(starter => [starter.id, starter.document]))
  const catalog: BlueprintCatalog = {
    get(id) {
      const builtIn = base.get(id)
      if (builtIn !== undefined) return builtIn
      const cached = resolved.get(id)
      if (cached !== undefined) return cached
      const document = byId.get(id)
      if (document === undefined) return undefined
      if (resolving.has(id)) throw new InvalidBlueprintError(`the starters in blueprints/ extend each other in a cycle (${[...resolving, id].join(' -> ')})`)
      resolving.add(id)
      try {
        const blueprint = blueprintFromManifest(document, catalog)
        resolved.set(id, blueprint)
        return blueprint
      } finally { resolving.delete(id) }
    },
    list() { return [...base.list(), ...starters.map(starter => catalog.get(starter.id)).filter((entry): entry is Blueprint => entry !== undefined)] },
  }
  return catalog
}
