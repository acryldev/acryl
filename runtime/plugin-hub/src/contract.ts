// A plugin's service contract and UI slots, read from its code (spec 044, spec.md "The service contract" and lifecycle.md D9 option D).
//
//   "acryl": {
//     "requires": { "host": ["connection", "webServer"], "client": ["slots"] },   the plugin's `inject`: what the app must provide
//     "provides": { "host": [], "client": [] },                                   services it registers: `super(ctx, 'x')`, `ctx.provide('x')`
//     "slots": { "offers": ["notes.panel"], "fills": ["conversation.session.header.actions"] }   UI places it declares and fills
//   }
//
// Generated, never hand-written, so a catalog, the Market and a Blend's builder can tell which app runs a plugin, which plugin supplies a missing
// service, and where in which kind of app it shows, without loading its code. In the pinned Cordis every `inject` entry is required; an
// optional dependency is a `ctx.get()` and is not part of the contract. Slots are read only in their literal form: a slot named by a variable
// is not listed (they describe, they do not gate).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type Side = 'host' | 'client'
export type SideLists = Partial<Record<Side, readonly string[]>>

export interface ServiceContract {
  readonly requires: SideLists
  readonly provides: SideLists
  readonly slots: { readonly offers: readonly string[]; readonly fills: readonly string[] }
}

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const SERVICE_NAME = /^[A-Za-z][A-Za-z0-9.\-_]*$/u
const SIDES: readonly Side[] = ['host', 'client']
let importCounter = 0

/** The host entry the Loader imports: `exports["."]`, then `main`, then `./index.js`. */
export function hostEntryOf(pkg: Readonly<Record<string, unknown>>): string {
  const exportsField = pkg['exports'] as Record<string, unknown> | undefined
  const dot = exportsField?.['.']
  return typeof dot === 'string' ? dot : typeof pkg['main'] === 'string' ? pkg['main'] : './index.js'
}

/** Services a source registers: a Service class's `super(ctx, 'name')`, `ctx.provide('name')` and `reflect.provide('name')`. */
export function providedServices(text: string): string[] {
  const out = new Set<string>()
  for (const pattern of [/super\(\s*ctx\s*,\s*'([A-Za-z0-9.\-_]+)'/gu, /ctx\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu, /reflect\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu]) {
    for (const match of text.matchAll(pattern)) if (match[1] !== undefined) out.add(match[1])
  }
  return [...out]
}

/** UI slots a source declares (`children: { 'name': { kind: ... } }`) and fills (`slots.register({ name: 'x' })`, `slots.inject('x', ...)`). */
export function slotsInSource(text: string): { readonly offers: string[]; readonly fills: string[] } {
  const offers = new Set<string>()
  const fills = new Set<string>()
  for (const match of text.matchAll(/['"]([A-Za-z][\w.-]*)['"]\s*:\s*\{\s*kind\s*:/gu)) if (match[1] !== undefined) offers.add(match[1])
  for (const match of text.matchAll(/slots\.(?:register|registerFactory)\(\s*\{\s*name\s*:\s*['"]([A-Za-z][\w.-]*)['"]/gu)) if (match[1] !== undefined) fills.add(match[1])
  for (const match of text.matchAll(/slots\.inject\(\s*['"]([A-Za-z][\w.-]*)['"]/gu)) if (match[1] !== undefined) fills.add(match[1])
  return { offers: [...offers], fills: [...fills] }
}

/** Service names of a Cordis `inject` value: an array, or a name -> config map (inherited keys included, as `Inject.resolve` does). */
function injectNames(inject: unknown): string[] {
  if (inject === undefined || inject === null) return []
  if (Array.isArray(inject)) return inject.filter((name): name is string => typeof name === 'string')
  const names: string[] = []
  for (const name in inject as Record<string, unknown>) names.push(name)
  return names
}

/**
 * A client bundle's `inject`, read from its source, not run: client bundles are written for the browser's module loader and cannot be imported
 * here. Only the literal list form is readable (`exports.inject = ['slots', 'connection']`); any other form is reported, so a contract is never
 * silently empty.
 */
export function clientInjectFromSource(text: string): { readonly names: readonly string[] } | { readonly error: string } {
  const at = /(?:\bexport\s+const\s+inject|\b(?:module\.)?exports\.inject)\s*=\s*/u.exec(text)
  if (at === null) return { names: [] }
  const list = /^\[([^\]]*)\]/u.exec(text.slice(at.index + at[0].length))
  if (list === null) return { error: 'the client bundle\'s "inject" is not a literal list; write it as exports.inject = [\'slots\', ...] so its contract can be read' }
  const names: string[] = []
  for (const item of (list[1] ?? '').split(',').map(entry => entry.trim()).filter(entry => entry !== '')) {
    const name = /^(['"])([^'"]+)\1$/u.exec(item)?.[2]
    if (name === undefined) return { error: `the client bundle's "inject" has a non-literal entry ${JSON.stringify(item)}; list the service names as strings` }
    names.push(name)
  }
  return { names }
}

/** The text of the balanced `[...]` or `{...}` starting at `open`, or undefined when it does not close. */
function balanced(text: string, open: number): string | undefined {
  const pairs: Record<string, string> = { '[': ']', '{': '}', '(': ')' }
  const stack: string[] = []
  let quote: string | undefined
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]!
    if (quote !== undefined) {
      if (char === '\\') index += 1
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (pairs[char] !== undefined) stack.push(pairs[char])
    else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) return text.slice(open, index + 1)
    }
  }
  return undefined
}

/**
 * A host entry's `inject`, read from its source when it is written literally (`export const inject = ['tools']`, `export const inject =
 * { tools: null }`, `static inject = [...]` in a Service class). Reading the source, not importing it, matters: a plugin imports packages
 * the app provides (`@deepseek-ai/dsh-tools`), which do not resolve from its source folder. Undefined when there is no literal `inject`.
 */
export function hostInjectFromSource(text: string): { readonly names: readonly string[] } | { readonly error: string } | undefined {
  const at = /(?:\bexport\s+const\s+inject|\bstatic\s+inject|\b(?:module\.)?exports\.inject)\s*=\s*/u.exec(text)
  if (at === null) return undefined
  const start = at.index + at[0].length
  const literal = balanced(text, start)
  if (literal === undefined || (literal[0] !== '[' && literal[0] !== '{')) return { error: 'the host entry\'s "inject" is not a literal list or object; write it as export const inject = [\'tools\', ...] so its contract can be read' }
  const body = literal.slice(1, -1)
  if (literal[0] === '[') {
    const names: string[] = []
    for (const item of body.split(',').map(entry => entry.trim()).filter(entry => entry !== '')) {
      const name = /^(['"])([^'"]+)\1$/u.exec(item)?.[2]
      if (name === undefined) return { error: `the host entry's "inject" has a non-literal entry ${JSON.stringify(item)}; list the service names as strings` }
      names.push(name)
    }
    return { names }
  }
  // An object: its top-level keys are the names (the values are per-service config).
  const names: string[] = []
  let depth = 0
  let token = ''
  let quote: string | undefined
  for (const char of body) {
    if (quote !== undefined) { if (char === quote) quote = undefined; if (depth === 0) token += char; continue }
    if (char === '"' || char === "'") { quote = char; if (depth === 0) token += char; continue }
    if ('[{('.includes(char)) depth += 1
    else if (']})'.includes(char)) depth -= 1
    else if (char === ':' && depth === 0) {
      const key = /^\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$.-]*))\s*$/u.exec(token.split(',').at(-1) ?? '')
      if (key === null) return { error: 'the host entry\'s "inject" object has a computed key; write its keys literally' }
      names.push(key[2] ?? key[3] ?? '')
      token = ''
      continue
    } else if (char === ',' && depth === 0) { token = ''; continue }
    if (depth === 0) token += char
  }
  return { names }
}

function sourceFiles(dir: string, skip: ReadonlySet<string>): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
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

const sorted = (names: Iterable<string>): string[] => [...new Set(names)].sort()

/**
 * Read a plugin's contract from its code. The host entry is imported (its `inject` is what the Loader sees, including a Service class's static
 * or decorated `inject`); the client bundle is read as source. Host `provides` scans every source file except the client bundle; slots scan all.
 */
export async function readServiceContract(dir: string): Promise<{ readonly errors: readonly string[]; readonly contract?: ServiceContract }> {
  let pkg: Record<string, unknown>
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown> } catch { return { errors: ['package.json is missing or invalid'] } }
  const errors: string[] = []
  const hostRel = hostEntryOf(pkg)
  const hostEntry = join(dir, hostRel)
  const exportsField = pkg['exports'] as Record<string, unknown> | undefined
  const dsh = pkg['dsh'] as Record<string, unknown> | undefined
  const clientRel = dsh?.['client'] !== undefined && typeof exportsField?.['./client'] === 'string' ? exportsField['./client'] as string : undefined
  const clientEntry = clientRel === undefined ? undefined : join(dir, clientRel)
  const requires: Partial<Record<Side, string[]>> = {}
  const provides: Partial<Record<Side, string[]>> = {}

  if (!existsSync(hostEntry)) errors.push(`the host entry ${hostRel} does not exist`)
  else {
    const literal = hostInjectFromSource(readFileSync(hostEntry, 'utf8'))
    if (literal !== undefined && 'names' in literal) requires.host = sorted(literal.names)
    else {
      // No literal (a computed or decorated `inject`): read it the way the Loader does, by importing the entry.
      try {
        const mod = await import(`${pathToFileURL(hostEntry).href}?contract=${++importCounter}-${Date.now()}`) as Record<string, unknown>
        const plugin = ('default' in mod ? mod['default'] : mod) as { inject?: unknown } | undefined
        requires.host = sorted(injectNames(plugin?.inject))
      } catch (cause) {
        errors.push(literal !== undefined && 'error' in literal
          ? literal.error
          : `importing ${hostRel} failed, so its "inject" cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    const skip = new Set(clientEntry === undefined ? [] : [clientEntry])
    provides.host = sorted(sourceFiles(dir, skip).flatMap(file => providedServices(readFileSync(file, 'utf8'))))
  }

  if (clientEntry !== undefined) {
    if (!existsSync(clientEntry)) errors.push(`the client bundle ${clientRel ?? ''} does not exist`)
    else {
      const source = readFileSync(clientEntry, 'utf8')
      const read = clientInjectFromSource(source)
      if ('error' in read) errors.push(read.error)
      else requires.client = sorted(read.names)
      provides.client = sorted(providedServices(source))
    }
  }
  const offers: string[] = []
  const fills: string[] = []
  for (const file of sourceFiles(dir, new Set())) {
    const found = slotsInSource(readFileSync(file, 'utf8'))
    offers.push(...found.offers)
    fills.push(...found.fills)
  }
  if (errors.length > 0) return { errors }
  return { errors, contract: { requires, provides, slots: { offers: sorted(offers), fills: sorted(fills) } } }
}

/** Shape errors for `acryl.requires`, `acryl.provides` and `acryl.slots` as a catalog reads them. */
export function checkContractShape(block: Readonly<Record<string, unknown>> | undefined): string[] {
  const errors: string[] = []
  for (const field of ['requires', 'provides'] as const) {
    const value = block?.[field]
    if (value === undefined) continue
    if (typeof value !== 'object' || value === null || Array.isArray(value)) { errors.push(`"acryl.${field}" must be an object with "host" and/or "client" lists`); continue }
    for (const [side, names] of Object.entries(value)) {
      if (!SIDES.includes(side as Side)) errors.push(`"acryl.${field}.${side}" is not a side; use "host" or "client"`)
      else if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && SERVICE_NAME.test(name))) errors.push(`"acryl.${field}.${side}" must be a list of service names`)
    }
  }
  const slots = block?.['slots']
  if (slots !== undefined) {
    if (typeof slots !== 'object' || slots === null || Array.isArray(slots)) errors.push('"acryl.slots" must be an object with "offers" and "fills" lists')
    else for (const [key, names] of Object.entries(slots)) {
      if (key !== 'offers' && key !== 'fills') errors.push(`"acryl.slots.${key}" is not "offers" or "fills"`)
      else if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && SERVICE_NAME.test(name))) errors.push(`"acryl.slots.${key}" must be a list of slot names`)
    }
  }
  return errors
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Bring package.json's `acryl.requires`, `acryl.provides` and `acryl.slots` in line with the code. The rest of the file keeps its content and key
 * order; it is rewritten with two-space indentation, and only when something changed. A package without an `acryl` block gets the documented
 * minimal one around the contract.
 */
export async function syncServiceContract(dir: string): Promise<{ readonly ok: true; readonly contract: ServiceContract; readonly written: boolean } | { readonly ok: false; readonly errors: readonly string[] }> {
  const read = await readServiceContract(dir)
  if (read.contract === undefined) return { ok: false, errors: read.errors }
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const existing = pkg['acryl']
  const block = typeof existing === 'object' && existing !== null ? existing as Record<string, unknown> : { schemaVersion: 1, artifacts: { plugins: [hostEntryOf(pkg)] } }
  const { contract } = read
  if (same(block['requires'], contract.requires) && same(block['provides'], contract.provides) && same(block['slots'], contract.slots)) return { ok: true, contract, written: false }
  pkg['acryl'] = { ...block, requires: contract.requires, provides: contract.provides, slots: contract.slots }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  return { ok: true, contract, written: true }
}
