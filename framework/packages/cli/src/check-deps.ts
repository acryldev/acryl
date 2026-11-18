import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { Io } from './io'

/**
 * The dependency rule (spec 049): app code imports a port, never a provider. A port is `acrylblends/db` (the `Db` type); a provider is a
 * driver or the one function that opens a database. Only the opener, a file the app names once in package.json, may import a provider.
 */

/** A package that is a database driver. An import of it, or of anything below it, is a provider import. */
const DRIVERS = [
  'node:sqlite',
  'sqlite',
  'sqlite3',
  'better-sqlite3',
  '@libsql/client',
  'libsql',
  'pg',
  'pg-pool',
  'pg-native',
  'postgres',
  '@electric-sql/pglite',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'mysql',
  'mysql2',
]
/** The openers a provider ships: importing one of them is opening a database. */
const OPENERS = ['acrylblends/db/sqlite', 'acryl-db-sqlite']
/** The desktop shell is where Electron lives (`acrylblends add desktop` copies it). */
const ELECTRON = 'electron'
const ELECTRON_HOMES = [
  'plugins/desktop/',
  'plugins/desktop-web/',
  'src/plugins/desktop/',
  'src/plugins/desktop-web/',
]
/** The provider plugins themselves may import what they wrap. */
const PROVIDER_HOMES = ['plugins/acryl-db-sqlite/', 'src/plugins/acryl-db-sqlite/']

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', 'build', 'coverage'])
const ROOTS = ['src', 'test', 'tests', 'plugins', 'extensions']

export interface Violation {
  readonly file: string
  readonly line: number
  readonly specifier: string
  readonly kind: 'driver' | 'opener' | 'electron'
}

const matches = (specifier: string, name: string): boolean =>
  specifier === name || specifier.startsWith(`${name}/`)

/** What a specifier is to the rule, or undefined when it is not a provider. */
export function classifySpecifier(specifier: string): Violation['kind'] | undefined {
  if (DRIVERS.some((name) => matches(specifier, name))) return 'driver'
  if (OPENERS.some((name) => matches(specifier, name))) return 'opener'
  if (matches(specifier, ELECTRON)) return 'electron'
  return undefined
}

/** The source with every comment replaced by spaces (newlines kept), so a line number still means what it did and a commented import is not an import. */
export function blankComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i] as string
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out += ' '.repeat(stop - i)
      i = stop
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(i, stop).replace(/[^\n]/gu, ' ')
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j += 1
        else if (c !== '`' && source[j] === '\n') break
        j += 1
      }
      out += source.slice(i, Math.min(j + 1, source.length))
      i = j + 1
    } else {
      out += c
      i += 1
    }
  }
  return out
}

/** `import x from 'a'`, `export * from 'a'`, `import 'a'`, `import('a')` and `require('a')`, with the line of each. */
const IMPORT =
  /(?:^|[\s;{}()])(?:import\s*(?:type\s+)?(?:[\w*${},\s]*?\s*from\s*)?|export\s*(?:type\s+)?[\w*${},\s]*?\s*from\s*|import\s*\(\s*|require\s*\(\s*)(['"])([^'"\n]+)\1/gu

export function importsOf(source: string): { specifier: string; line: number }[] {
  const code = blankComments(source)
  const found: { specifier: string; line: number }[] = []
  for (const match of code.matchAll(IMPORT)) {
    const specifier = match[2] as string
    const at = (match.index ?? 0) + match[0].length - specifier.length - 2
    found.push({ specifier, line: code.slice(0, at).split('\n').length })
  }
  return found
}

function listSources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) listSources(path, out)
    else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

/** The opener files the app declares: `"acryl": { "opener": "src/db.ts" }` (or a list) in package.json. */
export function openersOf(appDir: string): string[] {
  const file = join(appDir, 'package.json')
  if (!existsSync(file)) return []
  const declared = (JSON.parse(readFileSync(file, 'utf8')) as { acryl?: { opener?: unknown } })
    .acryl?.opener
  const list = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : []
  return list.filter((entry): entry is string => typeof entry === 'string')
}

/** Every provider import outside the declared opener (and the homes that may hold one), in file and line order. */
export function findViolations(appDir: string): Violation[] {
  const openers = new Set(openersOf(appDir).map((entry) => entry.split(sep).join('/')))
  const violations: Violation[] = []
  for (const root of ROOTS) {
    for (const path of listSources(join(appDir, root)).sort()) {
      const file = relative(appDir, path).split(sep).join('/')
      if (openers.has(file)) continue
      for (const { specifier, line } of importsOf(readFileSync(path, 'utf8'))) {
        const kind = classifySpecifier(specifier)
        if (kind === undefined) continue
        if (kind === 'electron' && ELECTRON_HOMES.some((home) => file.startsWith(home))) continue
        if (kind !== 'electron' && PROVIDER_HOMES.some((home) => file.startsWith(home))) continue
        violations.push({ file, line, specifier, kind })
      }
    }
  }
  return violations
}

const GUIDE = 'docs/framework/guides/data.md#why-the-database-is-opened-in-one-place'

function advice(violation: Violation, openers: readonly string[]): string {
  if (violation.kind === 'electron')
    return `"${violation.specifier}" is the desktop shell's: only plugins/desktop (added with "acrylblends add desktop") imports electron`
  const where =
    openers.length > 0
      ? openers.join(', ')
      : 'a file named in package.json "acryl": { "opener": "..." }'
  return violation.kind === 'driver'
    ? `"${violation.specifier}" is a database driver; take a Db (import type { Db } from "acrylblends/db") as an argument and let ${where} open the database`
    : `"${violation.specifier}" opens a database, and only ${where} may; take a Db (import type { Db } from "acrylblends/db") as an argument`
}

/** Parse `check-deps [dir]`. */
export function parseCheckDepsOptions(argv: readonly string[]): { directory: string | undefined } {
  const args = argv.filter((a) => !a.startsWith('-'))
  if (args.length !== argv.length || args.length > 1)
    throw new Error('check-deps takes at most one argument: the app folder')
  return { directory: args[0] }
}

/** Report each provider import outside the opener, as `file:line: why`. Returns the exit code: 1 when there is one. */
export function checkDeps(options: { directory: string | undefined }, io: Io): number {
  const appDir = resolve(io.cwd, options.directory ?? '.')
  const violations = findViolations(appDir)
  if (violations.length === 0) {
    io.stdout.write('check-deps: no app code imports a database provider outside the opener\n')
    return 0
  }
  const openers = openersOf(appDir)
  for (const violation of violations)
    io.stderr.write(`${violation.file}:${violation.line}: ${advice(violation, openers)}\n`)
  io.stderr.write(`See ${GUIDE}\n`)
  return 1
}
