// A registry is a git repository of starters (Blueprints and Blends) in one layout, `blends/<id>/blend.yaml` (plus lock, extensions, README), with an
// `index.json` built by its CI from entries that validate. The same code builds the public registry's index and a company's private one, and `acryl new
// --from <id>` reads it. Pure: the caller supplies the file texts.
import { parse as parseYaml } from 'yaml'
import type { BlendDocument } from './document.js'
import { parseDefinition } from './parse.js'
import { validateDefinition } from './validate.js'

export const REGISTRY_INDEX_FORMAT = 1

export interface RegistryEntry {
  id: string
  name: string
  kind: 'Blueprint' | 'Blend'
  version: string
  /** Path of the entry's folder inside the registry, e.g. `blends/acme.accounting`. */
  path: string
  license: string
  category?: string
  description?: string
  /** The Blueprint a Blend grew from. */
  lineage?: string
}

export interface RegistryIndex {
  formatVersion: typeof REGISTRY_INDEX_FORMAT
  entries: RegistryEntry[]
}

export interface RegistryProblem {
  path: string
  message: string
}

/**
 * Build a registry index from its entries. An entry is refused (and reported) when it does not validate for distribution, is marked `private`, names no
 * license, lives in a folder other than its own id, or repeats an id. Deterministic: sorted by id, no timestamps.
 */
export function buildRegistryIndex(sources: ReadonlyArray<{ path: string, manifestText: string }>): { index: RegistryIndex, problems: RegistryProblem[] } {
  const entries: RegistryEntry[] = []
  const problems: RegistryProblem[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    const { document, diagnostics } = parseDefinition(source.manifestText)
    const invalid = [...diagnostics, ...(diagnostics.length === 0 ? validateDefinition(document, 'distribution') : [])]
    if (invalid.length > 0) { problems.push(...invalid.map(d => ({ path: source.path, message: `${d.path}: ${d.message}` }))); continue }
    const doc = document as BlendDocument
    const { metadata } = doc
    if (metadata.visibility === 'private') { problems.push({ path: source.path, message: `${metadata.id} is marked private; a registry publishes only public starters` }); continue }
    if (metadata.license === undefined) { problems.push({ path: source.path, message: `${metadata.id} names no license (metadata.license)` }); continue }
    const folder = `blends/${metadata.id}`
    if (source.path !== folder) { problems.push({ path: source.path, message: `${metadata.id} must live in ${folder}` }); continue }
    if (seen.has(metadata.id)) { problems.push({ path: source.path, message: `${metadata.id} is listed twice` }); continue }
    seen.add(metadata.id)
    entries.push({
      id: metadata.id,
      name: metadata.name,
      kind: doc.kind,
      version: metadata.version,
      path: folder,
      license: metadata.license,
      ...(metadata.category === undefined ? {} : { category: metadata.category }),
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
      ...(doc.spec.lineage === undefined ? {} : { lineage: doc.spec.lineage.blueprint }),
    })
  }
  entries.sort((a, b) => a.id.localeCompare(b.id))
  return { index: { formatVersion: REGISTRY_INDEX_FORMAT, entries }, problems }
}

/** Read an `index.json`, refusing anything that is not a registry index this library understands. */
export function parseRegistryIndex(text: string): RegistryIndex {
  const value = parseYaml(text) as Partial<RegistryIndex> | null
  if (value === null || typeof value !== 'object' || value.formatVersion !== REGISTRY_INDEX_FORMAT || !Array.isArray(value.entries)) {
    throw new Error(`not a registry index (formatVersion ${String(REGISTRY_INDEX_FORMAT)} with entries)`)
  }
  for (const entry of value.entries) {
    if (typeof entry?.id !== 'string' || typeof entry.path !== 'string' || !/^blends\/[^/]+$/u.test(entry.path)) throw new Error(`registry index entry ${JSON.stringify(entry?.id)} has no valid path`)
  }
  return value as RegistryIndex
}
