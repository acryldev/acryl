#!/usr/bin/env node
// blends-registry-index <registry folder> [--check]
// What a registry's CI runs: validate every starter under `blends/<id>/blend.yaml` and write `index.json`. With --check it writes nothing and fails when
// the committed index is stale. Exit codes: 0 ok, 1 a refused entry or a stale index, 2 usage.
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { buildRegistryIndex } from '../registry.js'

export function indexText(root: string): { text: string, problems: string[] } {
  const blends = join(root, 'blends')
  const sources = existsSync(blends)
    ? readdirSync(blends, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(blends, entry.name, 'blend.yaml')))
      .map(entry => ({ path: `blends/${entry.name}`, manifestText: readFileSync(join(blends, entry.name, 'blend.yaml'), 'utf8') }))
    : []
  const { index, problems } = buildRegistryIndex(sources)
  return { text: `${JSON.stringify(index, null, 2)}\n`, problems: problems.map(problem => `${problem.path}: ${problem.message}`) }
}

export function main(argv: readonly string[], out: (line: string) => void = line => { process.stdout.write(`${line}\n`) }): number {
  const positional = argv.filter(arg => !arg.startsWith('--'))
  const check = argv.includes('--check')
  if (positional.length !== 1) { out('usage: blends-registry-index <registry folder> [--check]'); return 2 }
  const root = positional[0] ?? ''
  const { text, problems } = indexText(root)
  for (const problem of problems) out(`refused ${problem}`)
  const file = join(root, 'index.json')
  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current !== text) { out(`${file} is stale: run blends-registry-index ${root}`); return 1 }
  } else {
    writeFileSync(file, text)
    out(`wrote ${file}`)
  }
  return problems.length > 0 ? 1 : 0
}

/** Run when started directly or through the package's bin link (real paths: the link's name differs from this file's). */
function isEntryPoint(): boolean {
  const started = process.argv[1]
  if (started === undefined) return false
  try { return realpathSync(started) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2))
