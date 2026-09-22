#!/usr/bin/env node
// Registry seed generator (spec 038-ui-component-library, tasks.md T036).
//
// Reads this package's own sources of truth (registry-manifest.yml for provenance,
// contracts/components.json for props/surfaces/a11y) and emits, for every component
// that has BOTH a manifest entry and a contract entry, a self-contained registry item:
//
//   registry-seed/<id>/item.yaml         provenance + contract, one file, human-readable
//   registry-seed/<id>/web/<Name>.tsx    the component source (copied verbatim)
//   registry-seed/<id>/web/<Name>.module.css  its stylesheet, if it has one
//   registry-seed/index.json             generated, sorted, digests of every item's files
//
// This is the seed content for `acryl-ui-registry` (spec 038 plan.md Slice 7): the same
// hub form the `blends` repo already defines (roadmap D6, a git repo of definition
// directories plus a generated index.json). It is generated here, inside this repo,
// before any decision to push it to a separate one (that needs the user's go-ahead,
// per the outward-facing-action rule).
//
// Item id: `acryl.ui.<kebab-name>` (dot-namespaced lowercase, per D6). A component with
// no matching manifest entry (not yet extracted from DSH, or a plain composition with no
// provenance line) is skipped and reported, never silently guessed.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_DIR = join(ROOT, 'registry-seed')
const INDEX_FORMAT_VERSION = 1

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase()
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function loadManifest() {
  const doc = parseYaml(readFileSync(join(ROOT, 'registry-manifest.yml'), 'utf8'))
  const bySourceName = new Map()
  for (const entry of doc.components ?? []) bySourceName.set(entry.name, entry)
  return { source: doc.source, bySourceName }
}

function loadContract() {
  return JSON.parse(readFileSync(join(ROOT, 'contracts', 'components.json'), 'utf8'))
}

/** The registry dir name a component's TSX/CSS live under (some names, e.g. `fields`, are lowercase folders). */
function sourceDirFor(name) {
  const dir = join(ROOT, 'src', 'client', 'registry', name)
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : null
}

function collectSourceFiles(dir) {
  return readdirSync(dir).filter(file => file.endsWith('.tsx') || file.endsWith('.module.css'))
}

function main() {
  const manifest = loadManifest()
  const contract = loadContract()
  rmSync(REGISTRY_DIR, { recursive: true, force: true })
  mkdirSync(REGISTRY_DIR, { recursive: true })

  const indexEntries = []
  const skipped = []

  for (const [componentName, contractEntry] of Object.entries(contract.components)) {
    if (contractEntry.reexport === true) { skipped.push({ componentName, reason: 'reexport of an app primitive, not a registry-owned source' }); continue }
    const manifestEntry = manifest.bySourceName.get(componentName)
    const sourceDir = sourceDirFor(componentName)
    if (manifestEntry === undefined || sourceDir === null) {
      skipped.push({ componentName, reason: manifestEntry === undefined ? 'no registry-manifest.yml entry' : 'no src/client/registry source directory' })
      continue
    }
    const id = `acryl.ui.${kebab(componentName)}`
    const itemDir = join(REGISTRY_DIR, id)
    const webDir = join(itemDir, 'web')
    mkdirSync(webDir, { recursive: true })
    const files = []
    for (const file of collectSourceFiles(sourceDir)) {
      const content = readFileSync(join(sourceDir, file))
      writeFileSync(join(webDir, file), content)
      files.push({ path: `web/${file}`, digest: sha256(content) })
    }
    // Surfaces reflect what was actually copied (this generator only reads src/client/registry, which is web-only
    // today), never the contract's `surfaces` field blindly - that field describes where the NAME's shape applies,
    // not where THIS source lives. acryl-ui-tui's own hand-written components are a separate, not-yet-generated seed.
    const actualSurfaces = [...new Set(files.map(file => file.path.split('/')[0]))]
    const item = {
      id,
      version: contract.library?.version ?? '0.1.0',
      kind: 'ui-component',
      surfaces: actualSurfaces,
      origin: { source: manifest.source, from: manifestEntry.from, changed: manifestEntry.changed ?? null, note: manifestEntry.origin },
      contract: { props: contractEntry.props ?? {}, a11y: contractEntry.a11y ?? [], summary: contractEntry.summary ?? '' },
    }
    writeFileSync(join(itemDir, 'item.yaml'), stringifyYaml(item))
    const itemYamlDigest = sha256(readFileSync(join(itemDir, 'item.yaml')))
    indexEntries.push({
      id,
      kind: 'ui-component',
      version: item.version,
      surfaces: item.surfaces,
      path: `${id}/item.yaml`,
      digest: itemYamlDigest,
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
    })
  }

  indexEntries.sort((left, right) => left.id.localeCompare(right.id))
  const index = { formatVersion: INDEX_FORMAT_VERSION, generatedFrom: manifest.source, items: indexEntries }
  writeFileSync(join(REGISTRY_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)

  console.log(`generated ${indexEntries.length} registry item(s) into ${REGISTRY_DIR}`)
  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length}: ${skipped.map(s => `${s.componentName} (${s.reason})`).join(', ')}`)
  }
}

main()
