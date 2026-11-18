#!/usr/bin/env node
// Lint every GitHub Actions workflow in .github/workflows with actionlint (the wasm build, pinned in package.json), and add the one check actionlint
// cannot make for us: actionlint reads `${{ ... }}` expressions, but a GitHub expression written with single braces (`${ matrix.template }`) is plain text
// to it and reaches bash, where it dies as "bad substitution" - run 41518339598 on 2e779c3a shipped exactly that in three run scripts and all 17 frame
// jobs failed (2026-11-02). Both checks run before a push.
import './lib/scratch-home.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLinter } from 'actionlint'
import { parse } from 'yaml'

const workflows = join(fileURLToPath(new URL('..', import.meta.url)), '.github', 'workflows')

/** A `${...}` in a shell script: bash parameter expansion. A dotted name inside is impossible in bash and is a GitHub expression that lost its braces. */
const SHELL_SUBSTITUTION = /\$\{\s*([^}]*)\}/gu
const EXPRESSION_WITHOUT_BRACES = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9_]/u

/** Findings from the run scripts of one workflow's parsed document. */
function runScriptFindings(document, name) {
  const found = []
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}[${String(index)}]`)
      })
      return
    }
    if (node === null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      const here = path === '' ? key : `${path}.${key}`
      if (key === 'run' && typeof value === 'string') {
        for (const match of value.matchAll(SHELL_SUBSTITUTION)) {
          const inner = (match[1] ?? '').trim()
          if (!EXPRESSION_WITHOUT_BRACES.test(inner)) continue
          found.push(
            `${name}: ${here}: bash cannot substitute "${match[0]}"; a GitHub expression needs \${{ ${inner} }}`,
          )
        }
        continue
      }
      walk(value, here)
    }
  }
  walk(document, '')
  return found
}

const lint = await createLinter()
let findings = 0
const names = readdirSync(workflows)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort()
for (const name of names) {
  const source = readFileSync(join(workflows, name), 'utf8')
  for (const result of lint(source, name)) {
    findings += 1
    console.error(
      `${name}:${String(result.line)}:${String(result.column)}: ${result.kind}: ${result.message}`,
    )
  }
  for (const line of runScriptFindings(parse(source), name)) {
    findings += 1
    console.error(line)
  }
}
if (findings > 0) {
  console.error(
    `verify-workflows: ${String(findings)} finding(s) in ${String(names.length)} workflow(s)`,
  )
  process.exit(1)
}
console.log(`verify-workflows: OK (${String(names.length)} workflow(s))`)
