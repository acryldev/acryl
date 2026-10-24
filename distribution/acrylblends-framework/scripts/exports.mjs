#!/usr/bin/env node
/**
 * The package's `exports`, made from `subpaths.mjs`. `--write` writes them into package.json; `--check` (run by the build) fails when
 * package.json has drifted from the table or a built entry is missing.
 *
 *   node scripts/exports.mjs --write | --check
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportsMap } from '../subpaths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const expected = exportsMap()

if (process.argv.includes('--write')) {
  manifest.exports = expected
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`exports: wrote ${String(Object.keys(expected).length)} entries`)
} else if (process.argv.includes('--check')) {
  const problems = []
  if (JSON.stringify(manifest.exports) !== JSON.stringify(expected)) problems.push('package.json exports differ from subpaths.mjs; run node scripts/exports.mjs --write')
  for (const [key, target] of Object.entries(expected)) {
    if (typeof target === 'string') continue
    for (const file of [target.types, target.default]) if (!existsSync(join(root, file))) problems.push(`${key}: ${file} was not built`)
  }
  if (problems.length > 0) { for (const problem of problems) console.error(`exports: ${problem}`); process.exit(1) }
  console.log(`exports: ${String(Object.keys(expected).length)} entries match subpaths.mjs and are built`)
} else {
  console.error('usage: node scripts/exports.mjs --write | --check')
  process.exit(2)
}
