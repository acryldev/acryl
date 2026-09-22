#!/usr/bin/env node
// Manifest shape check (spec 038-ui-component-library). Runs FIRST in the gate, before the build, so a
// manifest that does not parse fails in under a second instead of after a two-minute build.
//
// Why this exists: registry-manifest.yml is prose-heavy YAML, and a plain `: ` inside a `changed:`
// value parses as a nested mapping. That trap was hit four times during T045 - each time the gate
// caught it correctly, but only at the generate step, after a full build. This is convenience, not
// correctness: it does not replace the ingest gate.
//
// Usage: node scripts/verify-manifest.mjs [path]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = process.argv[2] ?? join(ROOT, 'registry-manifest.yml')
const ORIGINS = ['ported', 'extracted', 'composed', 'gap']

let parsed
try {
  parsed = parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`manifest does not parse: ${error.message}`)
  console.error('A plain ": " inside a value starts a nested mapping in YAML. Use " - " instead.')
  process.exitCode = 1
  process.exit()
}

// The manifest opens with a header (`source: ...`) and then the entries, so accept either a bare list or
// the first list-valued property of the document.
const entries = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {}).find(value => Array.isArray(value))

if (!Array.isArray(entries)) {
  console.error(`manifest holds no list of entries (top level is ${parsed === null ? 'null' : typeof parsed})`)
  process.exitCode = 1
  process.exit()
}

const problems = []
for (const [index, entry] of entries.entries()) {
  const label = typeof entry?.name === 'string' && entry.name !== '' ? entry.name : `entry ${index}`
  if (typeof entry?.name !== 'string' || entry.name === '') problems.push(`${label} has no name`)
  const origin = String(entry?.origin ?? '')
  const kind = ORIGINS.find(word => origin.startsWith(word))
  if (kind === undefined) problems.push(`${label} has an unrecognised origin: ${origin === '' ? '(none)' : origin}`)
  // Only a ported item promises a source and a record of what changed; an extracted, composed or gap
  // item has no upstream shadcn URL to name. The ingest gate enforces the rest for ported items.
  if (kind === 'ported') {
    if (typeof entry?.from !== 'string' || entry.from === '') problems.push(`${label} is ported but names no from`)
    if (typeof entry?.changed !== 'string' || entry.changed === '') problems.push(`${label} is ported but records no changed`)
  }
}

if (problems.length > 0) {
  console.error(`manifest is missing required fields:\n  ${problems.join('\n  ')}`)
  process.exitCode = 1
} else {
  console.log(`verify-manifest: ${entries.length} entries, each with a name and an origin, and every ported one with a from and a changed`)
}