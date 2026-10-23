#!/usr/bin/env node
/**
 * Provenance of ported code. A package that ports source keeps `provenance.json` beside its `package.json`: the upstream commit, and for every
 * ported file the upstream file's hash, our file's hash, and - when our file is not a purely mechanical port - the reason.
 *
 *   node scripts/verify-port.mjs                          check every package's provenance against the files (used by check:layout)
 *   node scripts/verify-port.mjs --upstream <checkout>    also re-derive each file from the upstream checkout and check the deviations
 *   node scripts/verify-port.mjs --upstream <checkout> --expected-out <dir>
 *                                                         also write what each deviating file would be with only the mechanical changes
 *   node scripts/verify-port.mjs --upstream <checkout> --write <package dir>
 *                                                         record the current state; a new deviation is written with reason "TODO" and fails until explained
 *
 * Mechanical changes (applied by `normalize` below, so they need no reason): relative imports name the `.ts` file they resolve to; the upstream
 * name (read from the checkout's own package.json, never spelled here) becomes `App` in identifiers (also inside one), `acryl` in words and `acryl-router` in import
 * paths; code examples in comments import from our entry points; `@see` links to the upstream site and comment lines linking upstream issues are dropped; files named after the upstream project are named `app`.
 * Anything else is a deviation and carries a one-line reason.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize as normalizePath, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = ['plugins/acryl-router', 'plugins/acryl-node-server']

const args = process.argv.slice(2)
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const upstream = option('--upstream')
const writeTarget = option('--write')
/** Where to write the mechanically derived text of each deviating file, to diff it against ours. */
const expectedOut = option('--expected-out')

const sha256 = text => createHash('sha256').update(text).digest('hex')
const read = path => readFileSync(path, 'utf8')

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/**
 * Paths between upstream and here. The same relative path, except that a file named after the upstream project (`<name>.ts`, `<name>-base.ts`,
 * `<name>.test.ts`) is named `app` here; the name comes from the checkout, so neither the record nor this script spells it.
 */
function renamer(brand) {
  const pattern = new RegExp(`(^|/)${brand}((?:-base)?(?:\\.test)?\\.ts)$`, 'u')
  return {
    upstreamOf: ours => ours.replace(/(^|\/)app((?:-base)?(?:\.test)?\.ts)$/u, `$1${brand}$2`),
    oursOf: theirs => theirs.replace(pattern, '$1app$2'),
  }
}

/** Upstream text with the mechanical changes applied, as our file would read if nothing else changed. */
function normalize(text, theirPath, ourPath, ctx) {
  const { brand, map, upstreamRoot } = ctx
  const Brand = brand[0].toUpperCase() + brand.slice(1)
  const word = new RegExp(`\\b${brand}\\b`, 'gu')
  let s = text
  // Imports first, while they still name upstream's files; the rename map gives each one its path here.
  s = s.replace(/((?:from|import|declare module) )(['"])([^'"]+)\2/gu, (whole, pre, quote, spec) => {
    if (!spec.startsWith('.')) return whole
    let target
    if (pre.startsWith('declare module') && spec === '../..') target = map.oursOf(posix.normalize(posix.join(posix.dirname(theirPath), '../../context.ts')))
    else {
      const base = posix.normalize(posix.join(posix.dirname(theirPath), spec))
      const found = [base, `${base}.ts`, posix.join(base, 'index.ts')].find(candidate => candidate.endsWith('.ts') && existsSync(join(upstreamRoot, candidate)))
      if (found === undefined) return whole
      target = map.oursOf(found)
    }
    let path = posix.relative(posix.dirname(ourPath), target)
    if (!path.startsWith('.')) path = `./${path}`
    return `${pre}${quote}${path}${quote}`
  })
  // Code examples in comments import from our public entry points: the package, its middleware or its helpers.
  s = s.split('\n').map(line => !/^\s*\*/u.test(line) ? line : line.replace(new RegExp(`from '${brand}(?:/([a-z-]+))?'`, 'u'), (whole, sub) => {
    if (sub === undefined || sub === 'http-exception') return "from 'acryl-router'"
    if (existsSync(join(upstreamRoot, 'middleware', sub))) return "from 'acryl-router/middleware'"
    if (existsSync(join(upstreamRoot, 'helper', sub))) return "from 'acryl-router/helpers'"
    return whole
  })).join('\n')
  s = s.replaceAll(`${brand}-base`, 'app-base')
  s = s.replaceAll(`${Brand}Request`, 'AppRequest').replaceAll(`${Brand}Base`, 'AppBase').replaceAll(`${Brand}Options`, 'AppOptions')
  s = s.split('\n').filter(line => !(line.trim().startsWith('*') && new RegExp(`@see.*${brand}\\.dev`, 'iu').test(line))).join('\n')
  s = s.replace(new RegExp(`\\s*// https://github\\.com/${brand}js/\\S+`, 'gu'), '')
  s = s.replace(new RegExp(` and https://github\\.com/${brand}js/[^\\s)]+`, 'gu'), '')
  s = s.split('\n').filter(line => !(/^\s*(?:\*|\/\/)/u.test(line) && line.includes(`github.com/${brand}js`))).join('\n')
  s = s.replaceAll(`${brand}.dev`, 'acryl.dev')
  s = s.replace(new RegExp(`(['"\`])${brand}/`, 'gu'), '$1acryl-router/').replace(new RegExp(`\\b${brand}/`, 'gu'), 'acryl-router/')
  s = s.replaceAll(`declare module '${brand}'`, "declare module 'acryl-router'")
  s = s.replaceAll(Brand, 'App').replace(word, 'acryl')
  return s
}

const failures = []
const fail = message => { failures.push(message) }

for (const pkg of PACKAGES) {
  const dir = join(ROOT, pkg)
  const file = join(dir, 'provenance.json')
  if (!existsSync(file)) continue
  const record = JSON.parse(read(file))
  const ported = walk(join(dir, record.directory)).map(path => relative(dir, path).split('\\').join('/')).sort()
  const listed = Object.keys(record.files)
  const writing = writeTarget !== undefined && normalizePath(join(ROOT, writeTarget)) === normalizePath(dir)
  if (!writing) {
    for (const path of ported) if (!(path in record.files)) fail(`${pkg}: ${path} is not in provenance.json`)
    for (const path of listed) if (!ported.includes(path)) fail(`${pkg}: provenance.json lists ${path}, which does not exist`)
  }

  let ctx
  if (upstream !== undefined) {
    const upstreamRoot = join(upstream, record.upstreamRoot ?? '')
    const brand = JSON.parse(read(join(upstream, 'package.json'))).name
    const map = renamer(brand)
    // Paths inside `normalize` are relative to the upstream root on one side and to our ported directory on the other.
    ctx = { brand, map, upstreamRoot }
  }

  for (const path of ported) {
    const entry = record.files[path] ?? {}
    const ours = read(join(dir, path))
    if (ctx !== undefined) {
      const theirPath = ctx.map.upstreamOf(posix.relative(record.directory, path))
      const theirFile = join(ctx.upstreamRoot, theirPath)
      if (!existsSync(theirFile)) { fail(`${pkg}: ${path}: its upstream file does not exist in the checkout`); continue }
      const theirs = read(theirFile)
      const ourPath = posix.relative(record.directory, path)
      const expected = normalize(theirs, theirPath, ourPath, ctx)
      const mechanical = expected === ours
      if (!mechanical && expectedOut !== undefined) {
        const out = join(expectedOut, pkg, path)
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, expected)
      }
      if (writing) {
        entry.upstreamSha256 = sha256(theirs)
        entry.sha256 = sha256(ours)
        if (mechanical) delete entry.deviation
        else entry.deviation ??= 'TODO'
        record.files[path] = entry
      } else {
        if (entry.upstreamSha256 !== sha256(theirs)) fail(`${pkg}: ${path}: the upstream checkout is not the recorded commit (its upstream file differs)`)
        if (!mechanical && entry.deviation === undefined) fail(`${pkg}: ${path} deviates from its upstream file beyond the mechanical changes and gives no reason`)
      }
    }
    if (!writing) {
      if (entry.sha256 !== sha256(ours)) fail(`${pkg}: ${path} changed since provenance.json was written; re-run with --upstream <checkout> --write ${pkg} and give any new deviation its reason`)
      if (entry.deviation === 'TODO') fail(`${pkg}: ${path} has a deviation without a reason`)
    }
  }
  if (writing) {
    record.files = Object.fromEntries(Object.entries(record.files).filter(([path]) => ported.includes(path)).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    const todo = Object.entries(record.files).filter(([, entry]) => entry.deviation === 'TODO').map(([path]) => path)
    console.log(`verify-port: wrote ${pkg}/provenance.json (${String(Object.keys(record.files).length)} files, ${String(todo.length)} deviations need a reason)`)
    for (const path of todo) console.log(`  TODO ${path}`)
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`verify-port: ${message}`)
  process.exit(1)
}
if (writeTarget === undefined) console.log(`verify-port: ported files match their provenance${upstream === undefined ? '' : ' and the upstream checkout'}`)
