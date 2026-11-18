// The core boundary (specs/049 T018 in acryldev/acryl): the agent-free core must not reach the agent pack, the drivers, a model vendor, the frame or
// a DSH agent package. This reads an app folder as it is installed and names every offending import and every offending installed package:
//
//   - each source file of the app (not node_modules): static imports, re-exports, side-effect imports, dynamic import() and require()
//   - the installed closure: every package path in package-lock.json, so a dependency of a dependency counts too
//
// Pure apart from reading the folder; scripts/verify-core-boundary.mjs makes a real Blank app and runs it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx)$/u
const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'dist', '.acryl', '.acrylblends'])
/** The kernel: Cordis and the two packages it is built on. Every other @deepseek-ai package belongs to the DSH agent engine. */
const KERNEL = new Set(['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/cosmokit'])

/** Why a module name is outside the core, or undefined when the core may use it. Works for a bare package name and for a relative path. */
export function forbiddenReason(specifier) {
  if (specifier.startsWith('node:')) return undefined
  const segments = specifier
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
  const scope = segments[0]?.startsWith('@') === true ? segments[0] : undefined
  const pkg = scope === undefined ? segments[0] : `${scope}/${segments[1] ?? ''}`
  if (pkg === 'openai' || scope === '@openai' || scope === '@anthropic-ai') return 'a model vendor'
  if (scope === '@deepseek-ai' && !KERNEL.has(pkg)) return 'a DSH package (the agent engine)'
  if (scope === '@acrylblends' || segments.some((part) => /^(?:acryl-)?blends-frame$/u.test(part)))
    return 'the frame'
  for (const part of segments) {
    if (/^agent(?:[-_.]|s?$)/iu.test(part) || /^agent[A-Z]/u.test(part)) return 'the agent pack'
    if (/^driver-/u.test(part)) return 'a driver'
  }
  return undefined
}

/** The module names one source text asks for, comments removed first so a comment that mentions an agent is not an import. */
export function importsOf(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1')
  const found = []
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gu,
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gu,
  ]
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.push(match[1])
  return [...new Set(found)]
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) yield* sourceFiles(path)
    else if (SOURCE.test(name)) yield path
  }
}

/** Every installed package path of the app (`node_modules/a`, `node_modules/a/node_modules/b`), from its lock file. */
export function installedPackages(appDir) {
  const lock = join(appDir, 'package-lock.json')
  if (!existsSync(lock)) return []
  const packages = JSON.parse(readFileSync(lock, 'utf8')).packages ?? {}
  return Object.keys(packages).filter((path) => path.startsWith('node_modules/'))
}

/**
 * Everything in the app that crosses the boundary: `{ where, name, why }`, `where` a source file and line or `installed`. Empty means the core is clean.
 */
export function boundaryViolations(appDir) {
  const out = []
  for (const file of sourceFiles(appDir)) {
    const text = readFileSync(file, 'utf8')
    for (const specifier of importsOf(text)) {
      const why = forbiddenReason(specifier)
      if (why === undefined) continue
      const line = text.split('\n').findIndex((row) => row.includes(specifier)) + 1
      out.push({
        where: `${relative(appDir, file).split(sep).join('/')}:${line}`,
        name: specifier,
        why,
      })
    }
  }
  for (const path of installedPackages(appDir)) {
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    const why = forbiddenReason(name)
    if (why !== undefined) out.push({ where: 'installed', name: path, why })
  }
  return out
}
