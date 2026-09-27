#!/usr/bin/env node
// blends-validate [file ...] [--mode distribution|local-authoring]
// Validate Blend manifests (default: ./blend.yaml) the way the engine and the registry do. What an app's CI runs on every push.
// Exit codes: 0 valid, 1 a diagnostic, 2 usage or an unreadable file.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDefinition } from '../parse.js'
import { validateDefinition, type ValidationMode } from '../validate.js'

export function main(argv: readonly string[], out: (line: string) => void = line => { process.stdout.write(`${line}\n`) }): number {
  let mode: ValidationMode = 'distribution'
  const files: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (arg === '--mode') {
      const value = argv[index + 1]
      if (value !== 'distribution' && value !== 'local-authoring') { out('--mode is distribution or local-authoring'); return 2 }
      mode = value
      index += 1
    } else if (arg.startsWith('--')) { out(`unknown option ${arg}`); return 2 } else files.push(arg)
  }
  let failed = false
  for (const file of files.length === 0 ? ['blend.yaml'] : files) {
    let text: string
    try { text = readFileSync(file, 'utf8') } catch (cause) { out(`${file}: cannot read (${cause instanceof Error ? cause.message : String(cause)})`); return 2 }
    const { document, diagnostics } = parseDefinition(text)
    const problems = [...diagnostics, ...(diagnostics.length === 0 ? validateDefinition(document, mode) : [])]
    if (problems.length === 0) out(`${file}: valid`)
    else { failed = true; for (const problem of problems) out(`${file}: ${problem.path}: ${problem.message}`) }
  }
  return failed ? 1 : 0
}

function isEntryPoint(): boolean {
  const started = process.argv[1]
  if (started === undefined) return false
  try { return realpathSync(started) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2))
