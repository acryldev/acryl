#!/usr/bin/env node
/**
 * The framework's structure gate (spec 046): every package of the ACRYL Framework has the same shape, so a reader who knows one knows all.
 * A package must have a README with a usage example, a `name` export equal to its package name, an `apply` export, tests, and a Loader row whose id is its package name;
 * its source must not import the DeepSeek Harness (the framework sits beside it, not on it) and must not read homes or ports directly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
export const FRAMEWORK_PACKAGES = ['acryl-router', 'acryl-router-http', 'acryl-state', 'acryl-inspect']

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []
  })
}

export function problemsFor(name) {
  const dir = join(root, 'plugins', name)
  const problems = []
  const fail = message => problems.push(`${name}: ${message}`)
  if (!existsSync(join(dir, 'README.md'))) fail('no README.md')
  else if (!readFileSync(join(dir, 'README.md'), 'utf8').includes('```ts')) fail('README.md has no TypeScript usage example')
  const sources = existsSync(join(dir, 'src')) ? sourceFiles(join(dir, 'src')) : []
  if (sources.length === 0) fail('no src/')
  const all = sources.map(file => [file, readFileSync(file, 'utf8')])
  if (!all.some(([, text]) => text.includes(`export const name = '${name}'`))) fail(`no \`export const name = '${name}'\` (the Cordis plugin name equals the package name)`)
  if (!all.some(([, text]) => /export function apply\(/u.test(text))) fail('no `export function apply(ctx, ...)`')
  if (!existsSync(join(dir, 'tests')) || sourceFiles(join(dir, 'tests')).filter(file => file.endsWith('.spec.ts')).length === 0) fail('no tests/*.spec.ts')
  const patch = existsSync(join(dir, 'cordis.patch.yml')) ? readFileSync(join(dir, 'cordis.patch.yml'), 'utf8') : ''
  if (!new RegExp(`id: ${name}\\n\\s+name: ${name}\\b`, 'u').test(patch)) fail('cordis.patch.yml must insert a row whose id and name are the package name')
  for (const [file, text] of all) {
    const shown = file.slice(dir.length + 1)
    if (/from '@deepseek-ai\/dsh/u.test(text)) fail(`${shown} imports the DeepSeek Harness`)
    if (/homedir\(|ACRYL_HOME|DSH_HOME|ACRYL_WEB_PORT/u.test(text)) fail(`${shown} reads a home or port directly (use the appInstance service)`)
  }
  return problems
}

const problems = FRAMEWORK_PACKAGES.flatMap(problemsFor)
for (const doc of ['docs/framework/README.md']) if (!existsSync(join(root, doc))) problems.push(`missing ${doc}`)
if (problems.length > 0) {
  console.error(`verify-framework: ${String(problems.length)} problem(s)\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log(`verify-framework: ${String(FRAMEWORK_PACKAGES.length)} packages have the framework shape`)
