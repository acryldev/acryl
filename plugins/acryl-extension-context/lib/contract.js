import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * An extension's service contract: the Cordis services each side (host, client) needs from the app it is loaded into, and the ones it adds to
 * it. It is written into the extension's own package.json as `acryl.requires` and `acryl.provides` (spec 044), so a catalog, the Market and a
 * Blend's builder agent can tell whether an app can run the extension, and which other extension supplies a missing service, without
 * loading its code.
 *
 * It is generated, never hand-written: `requires` is the plugin's own `inject` declaration (in the pinned Cordis every `inject` entry is
 * required; an optional dependency is a `ctx.get()` and is not part of the contract), `provides` is every service its source registers
 * (`super(ctx, 'name')` in a Service class, `ctx.provide('name')`).
 *
 *   "acryl": { "requires": { "host": ["connection", "webServer"], "client": ["slots"] }, "provides": { "host": [], "client": [] } }
 */

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const SERVICE_NAME = /^[A-Za-z][A-Za-z0-9.\-_]*$/u
const SIDES = ['host', 'client']
let importCounter = 0

/** The host entry the Loader imports: `exports["."]`, then `main`, then `./index.js`. */
export function hostEntryOf(pkg) {
  return typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : typeof pkg.main === 'string' ? pkg.main : './index.js'
}

/** Services a source registers: a Service class's `super(ctx, 'name')` and `ctx.provide('name')`. */
export function providedServices(text) {
  const out = new Set()
  for (const m of text.matchAll(/super\(\s*ctx\s*,\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  for (const m of text.matchAll(/ctx\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  for (const m of text.matchAll(/reflect\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  return [...out]
}

/** Service names of a Cordis `inject` value: an array, or a name -> config map (inherited keys included, as `Inject.resolve` does). */
function injectNames(inject) {
  if (inject === undefined || inject === null) return []
  if (Array.isArray(inject)) return inject.filter(name => typeof name === 'string')
  const names = []
  for (const name in inject) names.push(name)
  return names
}

/**
 * A client bundle's `inject`, read from its source, not run: client bundles are written for the browser's module loader and cannot be
 * imported here. Only the literal list form is readable (`exports.inject = ['slots', 'connection']`, the form every example uses); any other
 * form is reported, so a contract is never silently empty.
 */
export function clientInjectFromSource(text) {
  const at = /(?:\bexport\s+const\s+inject|\b(?:module\.)?exports\.inject)\s*=\s*/u.exec(text)
  if (at === null) return { names: [] }
  const rest = text.slice(at.index + at[0].length)
  const list = /^\[([^\]]*)\]/u.exec(rest)
  if (list === null) return { error: 'the client bundle\'s "inject" is not a literal list; write it as exports.inject = [\'slots\', ...] so its contract can be read' }
  const items = list[1].split(',').map(item => item.trim()).filter(item => item !== '')
  const names = []
  for (const item of items) {
    const name = /^(['"])([^'"]+)\1$/u.exec(item)?.[2]
    if (name === undefined) return { error: `the client bundle's "inject" has a non-literal entry ${JSON.stringify(item)}; list the service names as strings` }
    names.push(name)
  }
  return { names }
}

function sourceFiles(dir, skip) {
  const out = []
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !skip.has(path)) out.push(path)
    }
  }
  walk(dir)
  return out.sort()
}

const sorted = names => [...new Set(names)].sort()

/**
 * Read an extension's contract from its code. The host entry is imported (its `inject` is what the Loader sees, including a Service class's
 * static or decorated `inject`); the client bundle is read as source. Host `provides` scans every source file except the client bundle.
 */
export async function readServiceContract(dir) {
  let pkg
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch { return { errors: ['package.json is missing or invalid'] } }
  const errors = []
  const hostRel = hostEntryOf(pkg)
  const hostEntry = join(dir, hostRel)
  const clientRel = pkg.dsh?.client !== undefined && typeof pkg.exports?.['./client'] === 'string' ? pkg.exports['./client'] : undefined
  const clientEntry = clientRel === undefined ? undefined : join(dir, clientRel)
  const contract = { requires: {}, provides: {} }

  if (!existsSync(hostEntry)) errors.push(`the host entry ${hostRel} does not exist`)
  else {
    try {
      const mod = await import(`${pathToFileURL(hostEntry).href}?contract=${++importCounter}-${Date.now()}`)
      const plugin = 'default' in mod ? mod.default : mod
      contract.requires.host = sorted(injectNames(plugin?.inject))
    } catch (cause) {
      errors.push(`importing ${hostRel} failed, so its "inject" cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    const skip = new Set(clientEntry === undefined ? [] : [clientEntry])
    contract.provides.host = sorted(sourceFiles(dir, skip).flatMap(file => providedServices(readFileSync(file, 'utf8'))))
  }

  if (clientEntry !== undefined) {
    if (!existsSync(clientEntry)) errors.push(`the client bundle ${clientRel} does not exist`)
    else {
      const source = readFileSync(clientEntry, 'utf8')
      const read = clientInjectFromSource(source)
      if (read.error !== undefined) errors.push(read.error)
      else contract.requires.client = sorted(read.names)
      contract.provides.client = sorted(providedServices(source))
    }
  }
  return errors.length > 0 ? { errors } : { errors, contract }
}

/** Shape errors for `acryl.requires` / `acryl.provides` as a catalog reads them. */
export function checkContractShape(block) {
  const errors = []
  for (const field of ['requires', 'provides']) {
    const value = block?.[field]
    if (value === undefined) continue
    if (typeof value !== 'object' || value === null || Array.isArray(value)) { errors.push(`"acryl.${field}" must be an object with "host" and/or "client" lists`); continue }
    for (const [side, names] of Object.entries(value)) {
      if (!SIDES.includes(side)) errors.push(`"acryl.${field}.${side}" is not a side; use "host" or "client"`)
      else if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && SERVICE_NAME.test(name))) errors.push(`"acryl.${field}.${side}" must be a list of service names`)
    }
  }
  return errors
}

const sameSides = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Bring package.json's `acryl.requires` / `acryl.provides` in line with the code. The rest of the file keeps its content and key order; it is
 * rewritten with two-space indentation, and only when the contract changed.
 */
export async function syncServiceContract(dir) {
  const read = await readServiceContract(dir)
  if (read.contract === undefined) return { ok: false, errors: read.errors }
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  // A package without an `acryl` block gets the documented minimal one (docs/extending/packaging.md), which a catalog requires around the contract.
  const block = typeof pkg.acryl === 'object' && pkg.acryl !== null ? pkg.acryl : { schemaVersion: 1, artifacts: { plugins: [hostEntryOf(pkg)] } }
  if (sameSides(block.requires, read.contract.requires) && sameSides(block.provides, read.contract.provides)) return { ok: true, contract: read.contract, written: false }
  pkg.acryl = { ...block, requires: read.contract.requires, provides: read.contract.provides }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  return { ok: true, contract: read.contract, written: true }
}
