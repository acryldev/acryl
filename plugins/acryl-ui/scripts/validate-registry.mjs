#!/usr/bin/env node
// Ingest gate (spec 038-ui-component-library, tasks.md T037): every registry item must pass
// before it is generated/published, the same way the `blends` repo's hub rejects `!!js` on
// ingest (roadmap D4). Reused rules, not reinvented: T030's style lint (no hex colors, no
// theme selectors, no static tokens outside the one documented exception) plus provenance,
// an import allow-list, and contract/spec presence.
//
// Run after scripts/generate-registry.mjs, against registry-seed/. Exits non-zero and prints
// every failure (not just the first) so a batch port can see everything wrong at once.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_DIR = join(ROOT, 'registry-seed')
const ALLOWED_IMPORTS = new Set(['react', 'clsx', '@deepseek-ai/dsh-client-ui-primitives'])
const ALLOWED_STATIC_TOKENS = new Map([['AppearanceCubes.module.css', ['--dsw-static-neutral-bluish-400']]])

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function checkItem(id) {
  const problems = []
  const itemDir = join(REGISTRY_DIR, id)
  const itemYamlPath = join(itemDir, 'item.yaml')
  const item = parseYaml(readFileSync(itemYamlPath, 'utf8'))

  if (item.origin?.source === undefined || item.origin?.note === undefined) problems.push('missing origin.source or origin.note (provenance)')
  if (item.contract?.summary === undefined || item.contract.summary === '') problems.push('missing contract.summary')

  const isPorted = typeof item.origin?.note === 'string' && item.origin.note.startsWith('ported')
  if (isPorted) {
    const hasLicence = /licen[cs]e/iu.test(`${item.origin.note} ${item.origin.from}`)
    if (!hasLicence) problems.push('a ported item must record the source licence in its provenance')
  }

  for (const file of walk(itemDir)) {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/^import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gmu)) {
        const specifier = match[1]
        if (specifier?.startsWith('.') === true) continue   // local module (its own .module.css, etc.)
        if (specifier !== undefined && !ALLOWED_IMPORTS.has(specifier)) problems.push(`disallowed import '${specifier}' in ${file.split('/').pop()}`)
      }
    }
    if (file.endsWith('.module.css')) {
      const name = file.split('/').pop() ?? file
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
      if (/#[0-9a-fA-F]{3,8}\b/u.test(css)) problems.push(`${name}: hex color`)
      if (/\.(dark|light)\b|data-ds-dark-theme|prefers-color-scheme/u.test(css)) problems.push(`${name}: theme selector`)
      const statics = [...css.matchAll(/--dsw-static-[a-z0-9-]+/gu)].map(m => m[0]).filter(token => !(ALLOWED_STATIC_TOKENS.get(name) ?? []).includes(token))
      if (statics.length > 0) problems.push(`${name}: static token outside the documented exception (${statics.join(', ')})`)
    }
  }

  return problems
}

function main() {
  const index = JSON.parse(readFileSync(join(REGISTRY_DIR, 'index.json'), 'utf8'))
  let failures = 0
  for (const entry of index.items) {
    const problems = checkItem(entry.id)
    if (problems.length > 0) {
      failures += 1
      console.error(`${entry.id}:`)
      for (const problem of problems) console.error(`  - ${problem}`)
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} item(s) failed the ingest gate`)
    process.exitCode = 1
    return
  }
  console.log(`${index.items.length} item(s) passed the ingest gate`)
}

main()
