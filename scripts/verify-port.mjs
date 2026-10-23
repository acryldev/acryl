#!/usr/bin/env node
/**
 * Provenance of ported code. A package that ports source keeps `provenance.json` beside its `package.json`: the upstream commit, and for every
 * ported file the upstream file's hash, our file's hash, and - when our file is not a purely mechanical port - the reason.
 *
 *   node scripts/verify-port.mjs                          check every package's provenance against the files (used by check:layout)
 *   node scripts/verify-port.mjs --upstream <checkout>... also re-derive each file from the checkout at its package's recorded commit
 *                                                         (repeat --upstream for packages ported from different projects)
 *   node scripts/verify-port.mjs --upstream <checkout> --expected-out <dir>
 *                                                         also write what each deviating file would be with only the mechanical changes
 *   node scripts/verify-port.mjs --upstream <checkout> --seed <package dir>
 *                                                         create every ported file that does not exist yet, with only the mechanical changes
 *   node scripts/verify-port.mjs --upstream <checkout> --write <package dir>
 *                                                         record the current state; a new deviation is written with reason "TODO" and fails until explained
 *
 * Mechanical changes (applied by `normalize` below, so they need no reason): relative imports name the `.ts` file they resolve to; the upstream
 * name (read from the checkout's own package.json, never spelled here) becomes `App` in identifiers (also inside one), `acryl` in words and `acryl-router` in import
 * paths; code examples in comments import from our entry points; `@see` links to the upstream site and comment lines linking upstream issues are dropped; files named after the upstream project are named `app` (modules) or `acryl` (data); paths the tests open name the directory here.
 * Anything else is a deviation and carries a one-line reason.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize as normalizePath, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = ['plugins/acryl-router', 'plugins/acryl-node-server']

const args = process.argv.slice(2)
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const writeTarget = option('--write')
const seedTarget = option('--seed')
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

/** The upstream project's name, from the checkout's package.json: the package name, or the scope of a scoped one (`@<name>/node-server`). */
function brandOf(checkout) {
  const { name } = JSON.parse(read(join(checkout, 'package.json')))
  return name.startsWith('@') ? name.slice(1).split('/')[0] : name
}

/** The checkout's commit, read without running git. */
function commitOf(checkout) {
  const git = join(checkout, '.git')
  const head = read(join(git, 'HEAD')).trim()
  if (!head.startsWith('ref: ')) return head
  const ref = head.slice(5)
  if (existsSync(join(git, ref))) return read(join(git, ref)).trim()
  const packed = existsSync(join(git, 'packed-refs')) ? read(join(git, 'packed-refs')) : ''
  return packed.split('\n').find(line => line.endsWith(` ${ref}`))?.split(' ')[0] ?? ''
}

/**
 * Paths between the checkout and the package: each `directories` pair maps an upstream directory onto one here, a module named after the
 * upstream project (`<name>.ts`, `<name>-base.ts`, `<name>.test.ts`) is named `app` here and a data file (`<name>.html`) `acryl`; the name
 * comes from the checkout, so neither the record nor this script spells it.
 */
function paths(directories, brand, checkout) {
  const module = new RegExp(`(^|/)${brand}((?:-base)?(?:\\.test)?\\.tsx?)$`, 'u')
  const data = new RegExp(`(^|/)${brand}(\\.[a-z]+)$`, 'u')
  const swap = (path, from, to) => (path === from ? to : `${to}/${path.slice(from.length + 1)}`)
  const within = (path, dir) => path === dir || path.startsWith(`${dir}/`)
  return {
    upstreamOf: ours => {
      const pair = directories.find(d => within(ours, d.ours))
      if (pair === undefined) return undefined
      const plain = swap(ours, pair.ours, pair.upstream)
      // A file upstream itself names `app` or `acryl` keeps its name.
      if (existsSync(join(checkout, plain))) return plain
      return plain.replace(/(^|\/)app((?:-base)?(?:\.test)?\.tsx?)$/u, `$1${brand}$2`).replace(/(^|\/)acryl(\.[a-z]+)$/u, `$1${brand}$2`)
    },
    oursOf: theirs => {
      const pair = directories.find(d => within(theirs, d.upstream))
      return pair === undefined ? undefined : swap(theirs, pair.upstream, pair.ours).replace(module, '$1app$2').replace(data, '$1acryl$2')
    },
  }
}

/** Upstream text with the mechanical changes applied, as our file would read if nothing else changed. Paths: checkout-relative and package-relative. */
function normalize(text, theirPath, ourPath, ctx) {
  const { brand, map, checkout, imports, directories } = ctx
  const Brand = brand[0].toUpperCase() + brand.slice(1)
  const word = new RegExp(`\\b${brand}\\b`, 'gu')
  const coreRoot = join(checkout, 'src')
  let s = text
  // Imports first, while they still name upstream's files: a relative one names the `.ts` file it resolves to, at its path here; a bare one into
  // the upstream package names the ACRYL entry point that exports the same thing (the record's `imports`, keyed by the subpath).
  s = s.replace(/((?:from|import|declare module) )(['"])([^'"]+)\2/gu, (whole, pre, quote, spec) => {
    if (spec === brand || spec.startsWith(`${brand}/`)) {
      const entry = imports?.[spec.slice(brand.length)]
      return entry === undefined ? whole : `${pre}${quote}${entry}${quote}`
    }
    if (!spec.startsWith('.')) return whole
    let target
    if (pre.startsWith('declare module') && spec === '../..') target = map.oursOf(posix.normalize(posix.join(posix.dirname(theirPath), '../../context.ts')))
    else {
      const base = posix.normalize(posix.join(posix.dirname(theirPath), spec))
      const found = [base, `${base}.ts`, posix.join(base, 'index.ts')].find(candidate => candidate.endsWith('.ts') && existsSync(join(checkout, candidate)))
      if (found === undefined) return whole
      target = map.oursOf(found)
    }
    if (target === undefined) return whole
    let path = posix.relative(posix.dirname(ourPath), target)
    if (!path.startsWith('.')) path = `./${path}`
    return `${pre}${quote}${path}${quote}`
  })
  // A path the tests open relative to the package root names the directory here (`test/fixtures/x` is `tests/adapter/fixtures/x`).
  for (const pair of directories) {
    if (pair.upstream !== pair.ours) s = s.replace(new RegExp(`(['"\`])(\\./)?${pair.upstream}/`, 'gu'), `$1$2${pair.ours}/`)
  }
  // Code examples in comments import from our public entry points: the package, its middleware or its helpers.
  s = s.split('\n').map(line => !/^\s*\*/u.test(line) ? line : line.replace(new RegExp(`from '${brand}(?:/([a-z-]+))?'`, 'u'), (whole, sub) => {
    if (sub === undefined || sub === 'http-exception') return "from 'acryl-router'"
    if (existsSync(join(coreRoot, 'middleware', sub))) return "from 'acryl-router/middleware'"
    if (existsSync(join(coreRoot, 'helper', sub))) return "from 'acryl-router/helpers'"
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
  s = s.replaceAll(Brand, 'App').replace(word, 'acryl').replace(new RegExp(`\\b${brand.toUpperCase()}\\b`, 'gu'), 'ACRYL')
  return s
}

/** Source and test data the normalizer rewrites; anything else (images, archives) is ported byte for byte and only hashed. */
const isText = path => /\.(?:ts|tsx|js|mjs|json|html|css|txt|md)$/u.test(path)

const failures = []
const fail = message => { failures.push(message) }

const checkouts = args.flatMap((arg, at) => (arg === '--upstream' && args[at + 1] !== undefined ? [args[at + 1]] : []))

for (const pkg of PACKAGES) {
  const dir = join(ROOT, pkg)
  const file = join(dir, 'provenance.json')
  if (!existsSync(file)) continue
  const record = JSON.parse(read(file))
  const directories = record.directories
  const ported = directories.flatMap(d => walk(join(dir, d.ours))).map(path => relative(dir, path).split('\\').join('/')).sort()
  const listed = Object.keys(record.files)
  const writing = writeTarget !== undefined && normalizePath(join(ROOT, writeTarget)) === normalizePath(dir)
  const seeding = seedTarget !== undefined && normalizePath(join(ROOT, seedTarget)) === normalizePath(dir)
  if (!writing && !seeding) {
    for (const path of ported) if (!(path in record.files)) fail(`${pkg}: ${path} is not in provenance.json`)
    for (const path of listed) if (!ported.includes(path)) fail(`${pkg}: provenance.json lists ${path}, which does not exist`)
  }

  // The checkout for this package is the one at its recorded commit.
  const checkout = checkouts.find(path => commitOf(path) === record.commit)
  if (checkouts.length > 0 && checkout === undefined) fail(`${pkg}: none of the --upstream checkouts is at commit ${record.commit}`)
  let ctx
  if (checkout !== undefined) {
    const brand = brandOf(checkout)
    ctx = { brand, map: paths(directories, brand, checkout), checkout, imports: record.imports, directories }
  }

  if (seedTarget !== undefined && normalizePath(join(ROOT, seedTarget)) === normalizePath(dir)) {
    if (ctx === undefined) fail(`${pkg}: --seed needs the --upstream checkout at ${record.commit}`)
    else {
      let created = 0
      for (const pair of directories) {
        for (const theirFile of walk(join(checkout, pair.upstream))) {
          const theirPath = relative(checkout, theirFile).split('\\').join('/')
          const path = ctx.map.oursOf(theirPath)
          if (path === undefined || existsSync(join(dir, path))) continue
          mkdirSync(dirname(join(dir, path)), { recursive: true })
          if (isText(path)) writeFileSync(join(dir, path), normalize(read(theirFile), theirPath, path, ctx))
          else copyFileSync(theirFile, join(dir, path))
          ported.push(path)
          created += 1
        }
      }
      ported.sort()
      console.log(`verify-port: seeded ${String(created)} files into ${pkg}`)
    }
  }

  for (const path of ported) {
    const entry = record.files[path] ?? {}
    const text = isText(path)
    const ours = text ? read(join(dir, path)) : readFileSync(join(dir, path))
    if (ctx !== undefined) {
      const theirPath = ctx.map.upstreamOf(path)
      if (theirPath === undefined || !existsSync(join(checkout, theirPath))) { fail(`${pkg}: ${path}: its upstream file does not exist in the checkout`); continue }
      const theirs = text ? read(join(checkout, theirPath)) : readFileSync(join(checkout, theirPath))
      const expected = text ? normalize(theirs, theirPath, path, ctx) : theirs
      const mechanical = text ? expected === ours : expected.equals(ours)
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
      } else if (!seeding) {
        if (entry.upstreamSha256 !== sha256(theirs)) fail(`${pkg}: ${path}: its upstream file differs from the recorded one`)
        if (!mechanical && entry.deviation === undefined) fail(`${pkg}: ${path} deviates from its upstream file beyond the mechanical changes and gives no reason`)
      }
    }
    if (!writing && !seeding) {
      if (entry.sha256 !== sha256(ours)) fail(`${pkg}: ${path} changed since provenance.json was written; re-run with --upstream <checkout> --write ${pkg} and give any new deviation its reason`)
      if (entry.deviation === 'TODO') fail(`${pkg}: ${path} has a deviation without a reason`)
    }
  }
  if (writing) {
    if (checkout === undefined) fail(`${pkg}: --write needs the --upstream checkout at ${record.commit}`)
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
if (writeTarget === undefined && seedTarget === undefined) console.log(`verify-port: ported files match their provenance${checkouts.length === 0 ? '' : ' and the upstream checkouts'}`)
