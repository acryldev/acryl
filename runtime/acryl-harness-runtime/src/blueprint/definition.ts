/**
 * Blueprint definition: the pure translation from untrusted data (a parsed YAML or JSON file) into a Blueprint, so a team can
 * define its own starter and brand it without writing code. No I/O here; `selection.ts` reads the file.
 *
 * ```yaml
 * id: acme.notes
 * name: Acme Notes
 * extends: acryl.blank          # optional: start from a known Blueprint, then override
 * brand: { name: Acme Notes, accent: '#0a7d4b' }
 * rows: [extension-context, system-prompt, ui-library, community-market]
 * ```
 *
 * Unknown keys, unknown capabilities and unknown rows are rejected, so a typo is an error at start-up, not a silently missing feature.
 *
 * @module acryl-harness-runtime/blueprint/definition
 */

import { ACRYL_CODING_CAPABILITIES, type AcrylCodingCapabilityId, type AcrylShellMode } from '../coding-capabilities.ts'
import { brandIdentity } from './brand-identity.ts'
import { BLUEPRINT_ROW_IDS, builtInCatalog, type Blueprint, type BlueprintCatalog, type BlueprintRowId } from './blueprint.ts'

const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u
const KEYS = new Set(['id', 'name', 'description', 'extends', 'capabilities', 'rows', 'brand', 'shell'])
const SHELLS: readonly AcrylShellMode[] = ['compatibility', 'advanced']

export class InvalidBlueprintError extends Error {
  constructor(detail: string) {
    super(`Invalid blueprint: ${detail}`)
    this.name = 'InvalidBlueprintError'
  }
}

function text(record: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new InvalidBlueprintError(`"${key}" must be a non-empty string of at most ${String(max)} characters`)
  return value.trim()
}

function oneOf<T extends string>(record: Record<string, unknown>, key: string, allowed: readonly T[]): readonly T[] | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new InvalidBlueprintError(`"${key}" must be a list`)
  const unknown = value.filter(entry => typeof entry !== 'string' || !allowed.includes(entry as T))
  if (unknown.length > 0) throw new InvalidBlueprintError(`"${key}" names ${unknown.map(entry => JSON.stringify(entry)).join(', ')}; known: ${allowed.join(', ')}`)
  return [...new Set(value as T[])]
}

/** Turn parsed data into a Blueprint. `extends` resolves against `catalog` (built-ins by default). */
export function parseBlueprint(input: unknown, catalog: BlueprintCatalog = builtInCatalog()): Blueprint {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidBlueprintError('expected an object')
  const record = input as Record<string, unknown>
  const stray = Object.keys(record).filter(key => !KEYS.has(key))
  if (stray.length > 0) throw new InvalidBlueprintError(`unknown key ${stray.map(key => JSON.stringify(key)).join(', ')}; known: ${[...KEYS].join(', ')}`)

  const id = text(record, 'id', 80)
  if (id === undefined || !ID.test(id)) throw new InvalidBlueprintError('"id" is required and must look like acme.notes (lowercase letters, digits, dots and dashes)')
  const parentId = text(record, 'extends', 80)
  const parent = parentId === undefined ? undefined : catalog.get(parentId)
  if (parentId !== undefined && parent === undefined) throw new InvalidBlueprintError(`"extends" names ${JSON.stringify(parentId)}, which is not a known blueprint`)

  const capabilities = oneOf(record, 'capabilities', ACRYL_CODING_CAPABILITIES.map(capability => capability.id) as readonly AcrylCodingCapabilityId[])
  const rows = oneOf(record, 'rows', BLUEPRINT_ROW_IDS as readonly BlueprintRowId[])
  const shell = text(record, 'shell', 20)
  if (shell !== undefined && !SHELLS.includes(shell as AcrylShellMode)) throw new InvalidBlueprintError(`"shell" must be one of ${SHELLS.join(', ')}`)
  const brand = record.brand === undefined
    ? undefined
    : { kind: 'custom', identity: brandIdentity(record.brand) } as const

  const base: Blueprint = parent ?? {
    id, name: id, description: '', capabilities: ['authorization'], rows: ['extension-context', 'system-prompt'], brand: { kind: 'acryl' }, shell: 'compatibility',
  }
  return Object.freeze({
    id,
    name: text(record, 'name', 80) ?? (parent === undefined ? base.name : id),
    description: text(record, 'description', 300) ?? base.description,
    capabilities: capabilities ?? base.capabilities,
    rows: rows ?? base.rows,
    brand: brand ?? base.brand,
    shell: (shell as AcrylShellMode | undefined) ?? base.shell,
  })
}
