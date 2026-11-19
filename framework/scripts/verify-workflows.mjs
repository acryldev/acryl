#!/usr/bin/env node
// Lint every GitHub Actions workflow in .github/workflows with actionlint (the wasm build, pinned in package.json), and add the one check actionlint
// cannot make for us: actionlint reads `${{ ... }}` expressions, but a GitHub expression written with single braces (`${ matrix.template }`) is plain text
// to it and reaches bash, where it dies as "bad substitution" - run 41518339598 on 2e779c3a shipped exactly that in three run scripts and all 17 frame
// jobs failed (2026-11-02). Both checks run before a push.
import './lib/scratch-home.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
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

let findings = 0
// The framework's own workflows: what is left in framework/.github/workflows (its old release, until the cut-over) and, inside ACRYL's monorepo
// (spec 051), its CI and its release at the repository root, .github/workflows/framework.yml and framework-release.yml.
const rootWorkflows = ['framework.yml', 'framework-release.yml']
  .map((name) => join(workflows, '..', '..', '..', '.github', 'workflows', name))
  .filter((file) => existsSync(file))
const files = [
  ...readdirSync(workflows)
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => join(workflows, name)),
  ...rootWorkflows,
].sort()
const names = files.map((file) => basename(file))
for (const file of files) {
  const name = basename(file)
  const source = readFileSync(file, 'utf8')
  // A fresh linter per file: actionlint's wasm build reuses its memory between calls and throws "offset is out of bounds" once the
  // files it has read add up past its first allocation (found when a fourth workflow joined the list, spec 051 T032).
  const lint = await createLinter()
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
