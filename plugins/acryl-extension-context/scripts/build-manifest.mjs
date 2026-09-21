#!/usr/bin/env node
/**
 * Validates docs/docs.json against the files on disk and regenerates
 * docs/README.md and example-plugins/README.md from it (spec 037 T009).
 *
 *   node scripts/build-manifest.mjs          validate, then write the indexes
 *   node scripts/build-manifest.mjs --check  validate and fail if an index is stale (gate mode)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderDocsIndex, renderExamplesIndex } from './lib/indexes.mjs'
import { validateManifest } from './lib/manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function listFiles(dir) {
  const out = []
  const walk = current => {
    for (const name of readdirSync(current)) {
      if (name === '.DS_Store') continue
      const full = join(current, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(relative(dir, full).split('\\').join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

export function buildPack(packRoot, { check }) {
  const manifest = JSON.parse(readFileSync(join(packRoot, 'docs/docs.json'), 'utf8'))
  const problems = validateManifest(manifest, {
    docFiles: listFiles(join(packRoot, 'docs')),
    exampleFiles: listFiles(join(packRoot, 'example-plugins')),
  })
  if (problems.length > 0) return { ok: false, problems }
  const targets = [
    [join(packRoot, 'docs/README.md'), renderDocsIndex(manifest)],
    [join(packRoot, 'example-plugins/README.md'), renderExamplesIndex(manifest)],
  ]
  const stale = []
  for (const [path, content] of targets) {
    let current = null
    try { current = readFileSync(path, 'utf8') } catch { /* missing */ }
    if (current === content) continue
    if (check) stale.push(relative(packRoot, path))
    else writeFileSync(path, content)
  }
  if (stale.length > 0) return { ok: false, problems: stale.map(p => `${p} is stale; run: pnpm run build:manifest`) }
  return { ok: true, problems: [] }
}

if (import.meta.main) {
  const result = buildPack(root, { check: process.argv.includes('--check') })
  if (!result.ok) {
    for (const problem of result.problems) console.error(`extension-context: ${problem}`)
    process.exit(1)
  }
  console.log('extension-context: manifest valid, indexes current')
}
