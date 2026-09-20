/**
 * Extension Context Pack manifest (spec 037, data-model.md). Pure validation:
 * the caller supplies the manifest and the list of files that exist, so tests
 * need no filesystem. Every invariant here is what makes "a doc not in the
 * manifest does not exist to the agent" true (FR-001) and keeps the index from
 * rotting (FR-015).
 */

export const SURFACES = ['tui', 'web', 'desktop']
export const APPLIES = ['all', 'partial', 'not-for-authors']
export const PLUGIN_TYPES = [
  'lifecycle-function', 'service-provider', 'service-consumer',
  'tool', 'event-hook', 'config-schema',
  'three-role-capability', 'prompt-contribution', 'skill-provider',
  'llm-adapter', 'agent-preset', 'host-route',
  'client-slot', 'desktop-main', 'tui-contribution',
  'packaging', 'generated-capability', 'diagnostics',
]

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
// The release pruner deletes these under node_modules (research.md Q3), so an
// example must never depend on files inside them.
const PRUNED_DIR = /(?:^|\/)(?:test|tests)(?:\/|$)/u

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const isSafeRelative = path => typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !/^[A-Za-z]:/u.test(path) && !path.split('/').includes('..')

/**
 * @param {unknown} manifest parsed docs.json
 * @param {{ docFiles: readonly string[], exampleFiles: readonly string[] }} files
 *   paths relative to docs/ and to examples/ (posix separators)
 * @returns {string[]} violations, empty when valid
 */
export function validateManifest(manifest, files) {
  const problems = []
  if (!isObject(manifest)) return ['manifest is not an object']
  if (manifest.schemaVersion !== 1) problems.push('schemaVersion must be 1')
  if (typeof manifest.packVersion !== 'string' || !SEMVER.test(manifest.packVersion)) problems.push('packVersion must be a semver string')
  if (!Array.isArray(manifest.navigation)) problems.push('navigation must be an array')
  if (!Array.isArray(manifest.examples)) problems.push('examples must be an array')
  if (problems.length) return problems

  const docFiles = new Set(files.docFiles)
  const exampleFiles = new Set(files.exampleFiles)
  const docIds = new Set()
  const exampleIds = new Set()
  const docPaths = new Set()

  const docs = []
  manifest.navigation.forEach((group, gi) => {
    if (!isObject(group) || typeof group.title !== 'string' || group.title === '' || !Array.isArray(group.items)) {
      problems.push(`navigation[${gi}] must have a title and items`)
      return
    }
    for (const item of group.items) docs.push(item)
  })

  for (const doc of docs) {
    const at = isObject(doc) && typeof doc.id === 'string' ? `doc ${doc.id}` : 'doc <no id>'
    if (!isObject(doc)) { problems.push(`${at}: not an object`); continue }
    if (typeof doc.id !== 'string' || !ID.test(doc.id)) problems.push(`${at}: id must be lowercase kebab/dot`)
    else if (docIds.has(doc.id)) problems.push(`${at}: duplicate id`)
    else docIds.add(doc.id)
    if (typeof doc.title !== 'string' || doc.title === '') problems.push(`${at}: title is required`)
    if (typeof doc.when !== 'string' || doc.when.trim() === '') problems.push(`${at}: "when" (read this when...) is required`)
    if (!isSafeRelative(doc.path)) problems.push(`${at}: path must be a safe relative path`)
    else {
      docPaths.add(doc.path)
      if (!docFiles.has(doc.path)) problems.push(`${at}: path ${doc.path} does not exist under docs/`)
    }
    if (!Array.isArray(doc.surfaces) || doc.surfaces.length === 0 || doc.surfaces.some(s => !SURFACES.includes(s))) problems.push(`${at}: surfaces must be a non-empty subset of ${SURFACES.join(', ')}`)
    if (!APPLIES.includes(doc.applies)) problems.push(`${at}: applies must be one of ${APPLIES.join(', ')}`)
  }

  for (const example of manifest.examples) {
    const at = isObject(example) && typeof example.id === 'string' ? `example ${example.id}` : 'example <no id>'
    if (!isObject(example)) { problems.push(`${at}: not an object`); continue }
    if (typeof example.id !== 'string' || !ID.test(example.id)) problems.push(`${at}: id must be lowercase kebab/dot`)
    else if (exampleIds.has(example.id)) problems.push(`${at}: duplicate id`)
    else exampleIds.add(example.id)
    if (!PLUGIN_TYPES.includes(example.type)) problems.push(`${at}: type must be a coverage-matrix type`)
    if (typeof example.teaches !== 'string' || example.teaches.trim() === '') problems.push(`${at}: teaches is required`)
    if (typeof example.scenario !== 'string' || example.scenario === '') problems.push(`${at}: scenario id is required`)
    if (!Array.isArray(example.surfaces) || example.surfaces.length === 0 || example.surfaces.some(s => !SURFACES.includes(s))) problems.push(`${at}: surfaces must be a non-empty subset of ${SURFACES.join(', ')}`)
    if (!isSafeRelative(example.path)) problems.push(`${at}: path must be a safe relative path`)
    else {
      const prefix = `packages/${example.path}/`
      if (![...exampleFiles].some(f => f.startsWith(prefix))) problems.push(`${at}: no files under examples/${prefix}`)
      if (PRUNED_DIR.test(example.path)) problems.push(`${at}: path uses a test/tests directory the release pruner deletes`)
      for (const f of exampleFiles) if (f.startsWith(prefix) && PRUNED_DIR.test(f.slice(prefix.length))) problems.push(`${at}: ${f} is inside a test/tests directory the release pruner deletes (use checks/)`)
    }
    if (!Array.isArray(example.docs)) problems.push(`${at}: docs must be an array of doc ids`)
    else for (const id of example.docs) if (!docIds.has(id)) problems.push(`${at}: unknown doc id ${id}`)
  }

  for (const doc of docs) {
    if (!isObject(doc) || typeof doc.id !== 'string') continue
    for (const id of doc.seeAlso ?? []) if (!docIds.has(id)) problems.push(`doc ${doc.id}: seeAlso unknown doc id ${id}`)
    for (const id of doc.examples ?? []) if (!exampleIds.has(id)) problems.push(`doc ${doc.id}: examples unknown example id ${id}`)
  }

  // Index completeness: nothing under docs/ or examples/ may exist unlisted.
  const generated = new Set(['docs.json', 'README.md'])
  for (const file of docFiles) {
    if (generated.has(file)) continue
    if (!docPaths.has(file)) problems.push(`docs/${file} is not listed in the manifest`)
  }
  const exampleRoots = new Set(manifest.examples.filter(e => isObject(e) && typeof e.path === 'string').map(e => `packages/${e.path}/`))
  const exampleMeta = new Set(['README.md', 'scenarios.json'])
  for (const file of exampleFiles) {
    if (exampleMeta.has(file)) continue
    if (![...exampleRoots].some(root => file.startsWith(root))) problems.push(`examples/${file} is not covered by any manifest example`)
  }
  return problems
}
