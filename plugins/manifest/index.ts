/**
 * The app manifest (`blend.yaml`): the app as data, in ACRYL's own Blend format (`blends.acryl.dev/v1alpha1`).
 *
 * Extracted from ACRYL Blends (`runtime/blends-core`). A manifest this plugin accepts is a valid ACRYL `blend.yaml`: a test checks
 * the templates' manifests against ACRYL's JSON schema, so an app can move into ACRYL without conversion.
 *
 * - A **Blueprint** is a definition with ordered `spec.rows` (`id` is the slot, `name` the plugin it loads, optional `config` and
 *   `disabled`) and typed `spec.parameters` substituted into config as `{{parameters.name}}`.
 * - A **Blend** is an instance of a Blueprint: it declares `spec.lineage` (which Blueprint, which version), and resolves over that
 *   parent. Its `spec.overrides` change inherited rows by id (a shallow merge: keys it sets win), and its own `spec.rows` are added
 *   after them. `spec.extends` names the parent explicitly (it must agree with the lineage). A parent resolves with its own defaults.
 * - `planUpgrade` (upgrade.ts) answers the question ACRYL leaves open: when the Blueprint moves to a new version, what changed, and
 *   which of this Blend's overrides and rows it breaks.
 *
 * Problems are diagnostics with a code and a path, never a bare "invalid". The code an app can use stays in `src/app.ts` as a static
 * registry of imports (so it type-checks); the manifest chooses, orders, configures and switches those plugins. A row may also name one of the
 * app's own plugin folders (`plugins/<name>/`, app-plugins.ts): that is how a feature is mounted. Extensions are not listed here: they come and go
 * while the app runs.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { parse } from 'yaml'

export const API_VERSION = 'blends.acryl.dev/v1alpha1'
/** The file name ACRYL uses for an app definition. */
export const MANIFEST_FILE = 'blend.yaml'

export type ParameterType = 'string' | 'number' | 'boolean'
export type ParameterValue = string | number | boolean

export interface ParameterDeclaration {
  readonly type: ParameterType
  readonly default: ParameterValue
}

/** A row as written in `spec.rows`. */
export interface BlendRow {
  readonly id: string
  readonly name: string
  readonly config?: Readonly<Record<string, unknown>>
  readonly disabled?: boolean
}

/** A change to an inherited row, by id. What it sets wins; what it omits is inherited. */
export interface OverrideEntry {
  readonly id: string
  readonly name?: string
  readonly config?: Readonly<Record<string, unknown>>
  readonly disabled?: boolean
}

/** A row as the app mounts it: `use` is the registry entry the row's `name` selects. */
export interface Row {
  readonly id: string
  readonly use: string
  readonly config?: Readonly<Record<string, unknown>>
  readonly disabled?: boolean
}

export interface Metadata {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly category?: string
  readonly description?: string
  readonly license?: string
  /** Anything but an explicit `public` is private: `save` never pushes a private app to a public remote. */
  readonly visibility?: 'private' | 'public'
}

/** Which Blueprint, at which version, a Blend was made from. */
export interface Lineage {
  readonly blueprint: string
  readonly blueprintVersion: string
}

export interface Manifest {
  readonly apiVersion: typeof API_VERSION
  readonly kind: 'Blueprint' | 'Blend'
  readonly metadata: Metadata
  readonly spec: {
    readonly runtime: 'cordis'
    readonly extends?: string
    readonly lineage?: Lineage
    readonly parameters?: Readonly<Record<string, ParameterDeclaration>>
    readonly rows?: readonly BlendRow[]
    readonly overrides?: readonly OverrideEntry[]
  }
}

export type DiagnosticCode =
  | 'parse-error'
  | 'schema-error'
  | 'duplicate-row-id'
  | 'unknown-plugin'
  | 'dangling-parameter-reference'
  | 'unused-parameter'
  | 'parameter-type-mismatch'
  | 'parameter-override-unknown'
  | 'blend-without-lineage'
  | 'blueprint-with-lineage'
  | 'lineage-extends-mismatch'
  | 'overrides-without-parent'
  | 'parent-not-supplied'
  | 'parent-cycle'
  | 'override-unknown-id'
  | 'insert-id-collision'

/** Every problem names where it is, as a path into the document. */
export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly path: string
  readonly message: string
}

export class ManifestError extends Error {
  override name = 'ManifestError'
  readonly diagnostics: readonly Diagnostic[]
  constructor(source: string, diagnostics: readonly Diagnostic[]) {
    super(
      `${source} is not a valid app manifest:\n${diagnostics.map((d) => `  ${d.path}: ${d.message} [${d.code}]`).join('\n')}`,
    )
    this.diagnostics = diagnostics
  }
}

export const DEFINITION_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/
const ROW_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const PARAMETER = /^[A-Za-z][A-Za-z0-9_-]*$/
const TOKEN = /\{\{parameters\.([A-Za-z0-9_-]+)\}\}/g
const WHOLE_TOKEN = /^\{\{parameters\.([A-Za-z0-9_-]+)\}\}$/
const TOP_FIELDS = new Set(['apiVersion', 'kind', 'metadata', 'spec'])
const METADATA_FIELDS = new Set([
  'id',
  'name',
  'version',
  'category',
  'description',
  'license',
  'visibility',
])
const SPEC_FIELDS = new Set(['runtime', 'extends', 'lineage', 'parameters', 'rows', 'overrides'])
const ROW_FIELDS = new Set(['id', 'name', 'config', 'disabled'])
const OVERRIDE_FIELDS = new Set(['id', 'name', 'config', 'disabled'])
const LINEAGE_FIELDS = new Set(['blueprint', 'blueprintVersion'])
const PARAMETER_FIELDS = new Set(['type', 'default'])
const TYPES = new Set<ParameterType>(['string', 'number', 'boolean'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every string inside a config value, with its path. Tokens are recognised in string values only. */
function walkStrings(
  value: unknown,
  path: string,
  visit: (text: string, path: string) => void,
): void {
  if (typeof value === 'string') visit(value, path)
  else if (Array.isArray(value))
    for (const [index, item] of value.entries()) walkStrings(item, `${path}[${index}]`, visit)
  else if (isObject(value))
    for (const [key, item] of Object.entries(value)) walkStrings(item, `${path}.${key}`, visit)
}

/** The id of the definition a document resolves over: `extends`, else a Blend's lineage Blueprint. */
export function parentIdOf(document: Pick<Manifest, 'kind' | 'spec'>): string | undefined {
  if (document.spec.extends !== undefined) return document.spec.extends
  return document.kind === 'Blend' ? document.spec.lineage?.blueprint : undefined
}

/**
 * Validate one parsed document on its own (its parent is not read here; see `loadManifest`). An empty list means valid. `known` is
 * the registry's names, so an unknown row `name` is reported here, before anything is mounted.
 */
export function validate(document: unknown, known?: Iterable<string>): Diagnostic[] {
  const problems: Diagnostic[] = []
  const add = (code: DiagnosticCode, path: string, message: string) =>
    problems.push({ code, path, message })
  if (!isObject(document))
    return [{ code: 'schema-error', path: '$', message: 'the manifest must be a map' }]
  for (const key of Object.keys(document))
    if (!TOP_FIELDS.has(key)) add('schema-error', key, `unknown field '${key}'`)
  if (document.apiVersion !== API_VERSION)
    add('schema-error', 'apiVersion', `must be '${API_VERSION}'`)
  if (document.kind !== 'Blueprint' && document.kind !== 'Blend')
    add('schema-error', 'kind', "must be 'Blueprint' or 'Blend'")

  const metadata = document.metadata
  if (!isObject(metadata))
    add('schema-error', 'metadata', 'missing required field metadata (id, name, version)')
  else {
    for (const key of Object.keys(metadata))
      if (!METADATA_FIELDS.has(key))
        add('schema-error', `metadata.${key}`, `unknown field '${key}'`)
    if (typeof metadata.id !== 'string' || !DEFINITION_ID.test(metadata.id))
      add('schema-error', 'metadata.id', "must be a dotted id such as 'acrylblends.my-app'")
    if (typeof metadata.name !== 'string' || metadata.name === '')
      add('schema-error', 'metadata.name', 'missing required field name')
    if (typeof metadata.version !== 'string' || !SEMVER.test(metadata.version))
      add('schema-error', 'metadata.version', 'must be a semantic version such as 0.1.0')
    if (
      metadata.visibility !== undefined &&
      metadata.visibility !== 'private' &&
      metadata.visibility !== 'public'
    )
      add('schema-error', 'metadata.visibility', "must be 'private' or 'public'")
  }

  const spec = document.spec
  const declared = new Map<string, ParameterType>()
  const used = new Set<string>()
  const registry = known ? new Set(known) : undefined
  const ids = new Set<string>()
  if (!isObject(spec)) {
    add('schema-error', 'spec', 'missing required field spec (runtime)')
    return problems
  }
  for (const key of Object.keys(spec))
    if (!SPEC_FIELDS.has(key)) add('schema-error', `spec.${key}`, `unknown field '${key}'`)
  if (spec.runtime !== 'cordis') add('schema-error', 'spec.runtime', "must be 'cordis'")

  // Kind, lineage and extends agree with each other.
  const lineage = spec.lineage
  if (lineage !== undefined) {
    if (!isObject(lineage))
      add('schema-error', 'spec.lineage', 'must be { blueprint, blueprintVersion }')
    else {
      for (const key of Object.keys(lineage))
        if (!LINEAGE_FIELDS.has(key))
          add('schema-error', `spec.lineage.${key}`, `unknown field '${key}'`)
      if (typeof lineage.blueprint !== 'string' || !DEFINITION_ID.test(lineage.blueprint))
        add('schema-error', 'spec.lineage.blueprint', 'must be a dotted Blueprint id')
      if (typeof lineage.blueprintVersion !== 'string' || !SEMVER.test(lineage.blueprintVersion))
        add('schema-error', 'spec.lineage.blueprintVersion', 'must be a semantic version')
    }
  }
  if (
    spec.extends !== undefined &&
    (typeof spec.extends !== 'string' || !DEFINITION_ID.test(spec.extends))
  )
    add('schema-error', 'spec.extends', 'must be a dotted definition id')
  if (document.kind === 'Blend' && lineage === undefined)
    add(
      'blend-without-lineage',
      'spec.lineage',
      'a Blend must declare spec.lineage (its Blueprint and version)',
    )
  if (document.kind === 'Blueprint' && lineage !== undefined)
    add(
      'blueprint-with-lineage',
      'spec.lineage',
      'a Blueprint must not declare spec.lineage; lineage belongs to Blends',
    )
  if (isObject(lineage) && spec.extends !== undefined && spec.extends !== lineage.blueprint)
    add(
      'lineage-extends-mismatch',
      'spec.extends',
      `extends '${String(spec.extends)}' must agree with lineage.blueprint '${String(lineage.blueprint)}'`,
    )

  const parameters = spec.parameters ?? {}
  if (!isObject(parameters))
    add('schema-error', 'spec.parameters', 'must be a map of name to { type, default }')
  else {
    for (const [name, declaration] of Object.entries(parameters)) {
      const path = `spec.parameters.${name}`
      if (!PARAMETER.test(name))
        add('schema-error', path, 'a parameter name is letters, digits, _ and -')
      if (!isObject(declaration) || !TYPES.has(declaration.type as ParameterType)) {
        add('schema-error', `${path}.type`, "must be 'string', 'number' or 'boolean'")
        continue
      }
      for (const key of Object.keys(declaration))
        if (!PARAMETER_FIELDS.has(key))
          add('schema-error', `${path}.${key}`, `unknown field '${key}'`)
      if (typeof declaration.default !== declaration.type)
        add('parameter-type-mismatch', `${path}.default`, `must be a ${declaration.type}`)
      declared.set(name, declaration.type as ParameterType)
    }
  }

  const checkTokens = (config: unknown, path: string) => {
    walkStrings(config, path, (text, at) => {
      for (const [, name] of text.matchAll(TOKEN)) {
        used.add(name as string)
        if (!declared.has(name as string))
          add('dangling-parameter-reference', at, `refers to undeclared parameter '${name}'`)
      }
    })
  }
  const checkFlags = (entry: Record<string, unknown>, path: string, fields: Set<string>) => {
    for (const key of Object.keys(entry))
      if (!fields.has(key)) add('schema-error', `${path}.${key}`, `unknown field '${key}'`)
    if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean')
      add('schema-error', `${path}.disabled`, 'must be true or false')
    if (entry.config !== undefined && !isObject(entry.config))
      add('schema-error', `${path}.config`, 'must be a map')
    if (isObject(entry.config)) checkTokens(entry.config, `${path}.config`)
  }
  const checkName = (name: unknown, path: string) => {
    if (registry && typeof name === 'string' && !registry.has(name))
      add(
        'unknown-plugin',
        path,
        `no plugin '${name}' in the app's registry (known: ${[...registry].join(', ')})`,
      )
  }

  const rows = spec.rows ?? []
  if (!Array.isArray(rows)) add('schema-error', 'spec.rows', 'must be a list of rows')
  else {
    for (const [index, row] of (rows as unknown[]).entries()) {
      const path = `spec.rows[${index}]`
      if (!isObject(row)) {
        add('schema-error', path, 'a row must be a map with an id and a name')
        continue
      }
      if (typeof row.id !== 'string' || !ROW_ID.test(row.id)) {
        add('schema-error', `${path}.id`, 'must be lowercase letters, digits and dashes')
        continue
      }
      if (ids.has(row.id)) add('duplicate-row-id', `${path}.id`, `the id '${row.id}' is used twice`)
      ids.add(row.id)
      if (typeof row.name !== 'string' || row.name === '')
        add(
          'schema-error',
          `${path}.name`,
          'missing required field name (the plugin this row loads)',
        )
      else checkName(row.name, `${path}.name`)
      checkFlags(row, path, ROW_FIELDS)
    }
  }

  const overrides = spec.overrides ?? []
  if (!Array.isArray(overrides))
    add('schema-error', 'spec.overrides', 'must be a list of overrides')
  else {
    const seen = new Set<string>()
    for (const [index, entry] of (overrides as unknown[]).entries()) {
      const path = `spec.overrides[${index}]`
      if (!isObject(entry)) {
        add('schema-error', path, 'an override must be a map with an id')
        continue
      }
      if (typeof entry.id !== 'string' || entry.id === '') {
        add(
          'schema-error',
          `${path}.id`,
          'missing required field id (the inherited row it changes)',
        )
        continue
      }
      if (seen.has(entry.id))
        add('duplicate-row-id', `${path}.id`, `the override id '${entry.id}' is used twice`)
      seen.add(entry.id)
      if (entry.name !== undefined) {
        if (typeof entry.name !== 'string' || entry.name === '')
          add('schema-error', `${path}.name`, 'must be a plugin name')
        else checkName(entry.name, `${path}.name`)
      }
      checkFlags(entry, path, OVERRIDE_FIELDS)
    }
    if (overrides.length > 0 && parentIdOf(document as unknown as Manifest) === undefined)
      add(
        'overrides-without-parent',
        'spec.overrides',
        'overrides need a parent: declare spec.extends, or make this a Blend with a lineage',
      )
  }
  for (const name of declared.keys())
    if (!used.has(name))
      add('unused-parameter', `spec.parameters.${name}`, `'${name}' is declared but not used`)
  return problems
}

function substitute(value: unknown, values: Readonly<Record<string, ParameterValue>>): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE_TOKEN.exec(value)
    if (whole) return values[whole[1] as string] ?? value
    return value.replace(TOKEN, (token, name: string) =>
      name in values ? String(values[name]) : token,
    )
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, values))
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, values)]),
    )
  return value
}

/** A manifest with its parameters resolved: every row's config has its tokens replaced, typed where a value is one whole token. */
export interface ResolvedManifest extends Manifest {
  /** The rows to mount, in order: the parent's rows (with overrides applied), then this document's own. `use` selects the registry entry. */
  readonly plugins: readonly Row[]
  readonly values: Readonly<Record<string, ParameterValue>>
  /** sha256 of the manifest file's bytes. */
  readonly digest: string
}

export interface LoadOptions {
  readonly known?: Iterable<string>
  /** Values for the parameters of this document. A parent always resolves with its own defaults. */
  readonly values?: Readonly<Record<string, ParameterValue>>
  /** Where the parent Blueprint of a Blend lives: its file path by definition id, or undefined when it is not supplied. */
  readonly getBlueprint?: (id: string) => string | undefined
}

function parseFile(file: string): { text: string; document: unknown } | Diagnostic[] {
  if (!existsSync(file))
    return [{ code: 'parse-error', path: '$', message: `${file} does not exist` }]
  const text = readFileSync(file, 'utf8')
  try {
    return { text, document: parse(text) }
  } catch (error) {
    return [
      {
        code: 'parse-error',
        path: '$',
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

function collectValues(
  declarations: Readonly<Record<string, ParameterDeclaration>>,
  given: Readonly<Record<string, ParameterValue>> | undefined,
  diagnostics: Diagnostic[],
): Record<string, ParameterValue> {
  const values: Record<string, ParameterValue> = {}
  for (const [name, declaration] of Object.entries(declarations)) values[name] = declaration.default
  for (const [name, value] of Object.entries(given ?? {})) {
    const declared = declarations[name]
    if (!declared)
      diagnostics.push({
        code: 'parameter-override-unknown',
        path: `spec.parameters.${name}`,
        message: `no parameter '${name}' to set`,
      })
    else if (typeof value !== declared.type)
      diagnostics.push({
        code: 'parameter-type-mismatch',
        path: `spec.parameters.${name}`,
        message: `must be a ${declared.type}`,
      })
    else values[name] = value
  }
  return values
}

const substituted = (
  config: Readonly<Record<string, unknown>> | undefined,
  values: Record<string, ParameterValue>,
) => (config === undefined ? {} : { config: substitute(config, values) as Record<string, unknown> })

/** A shallow per-key merge: keys the override sets win, keys it omits are inherited. The parent's row is never changed. */
function merged(row: Row, entry: OverrideEntry, values: Record<string, ParameterValue>): Row {
  const config =
    entry.config === undefined
      ? row.config
      : { ...row.config, ...(substitute(entry.config, values) as Record<string, unknown>) }
  const disabled = entry.disabled ?? row.disabled
  return {
    id: row.id,
    use: entry.name ?? row.use,
    ...(config === undefined ? {} : { config }),
    ...(disabled === undefined ? {} : { disabled }),
  }
}

/**
 * Resolve one document over its parent chain. Every problem is a diagnostic; nothing throws for invalid input. Rules (ACRYL's): the
 * parent is `extends`, else a Blend's lineage Blueprint; a parent resolves with its own defaults; an override must name a row the
 * resolved parent has; an own row must not reuse a parent row's id; a cycle or a missing parent is reported.
 */
export function resolveRows(
  document: Manifest,
  options: Pick<LoadOptions, 'values' | 'getBlueprint'>,
  chain: readonly string[],
  diagnostics: Diagnostic[],
  where = '',
): { rows: Row[]; values: Record<string, ParameterValue> } {
  const at = (path: string) => `${where}${path}`
  const values = collectValues(document.spec.parameters ?? {}, options.values, diagnostics)
  let inherited: Row[] = []
  // False when the parent could not be read or resolved: its problems are reported, and checks against its rows would only add noise.
  let parentResolved = parentIdOf(document) === undefined
  const parentId = parentIdOf(document)
  const parentPath = document.spec.extends !== undefined ? 'spec.extends' : 'spec.lineage.blueprint'
  if (parentId !== undefined) {
    if (chain.includes(parentId)) {
      diagnostics.push({
        code: 'parent-cycle',
        path: at(parentPath),
        message: `parent '${parentId}' closes a cycle in the resolution chain`,
      })
    } else {
      const file = options.getBlueprint?.(parentId)
      const read = file === undefined ? undefined : parseFile(file)
      if (read === undefined || Array.isArray(read)) {
        diagnostics.push({
          code: 'parent-not-supplied',
          path: at(parentPath),
          message:
            read === undefined
              ? `parent '${parentId}' is not supplied (getBlueprint returned nothing)`
              : `parent '${parentId}': ${read[0]?.message}`,
        })
      } else {
        const problems = validate(read.document)
        if (problems.length > 0) {
          for (const problem of problems)
            diagnostics.push({ ...problem, path: `parent '${parentId}': ${problem.path}` })
        } else {
          inherited = resolveRows(
            read.document as Manifest,
            options.getBlueprint ? { getBlueprint: options.getBlueprint } : {},
            [...chain, parentId],
            diagnostics,
            `parent '${parentId}': `,
          ).rows
          parentResolved = !diagnostics.some((d) => d.path.startsWith(`parent '${parentId}'`))
        }
      }
    }
  }
  const own: Row[] = (document.spec.rows ?? []).map((row) => ({
    id: row.id,
    use: row.name,
    ...substituted(row.config, values),
    ...(row.disabled === undefined ? {} : { disabled: row.disabled }),
  }))
  const parentIds = new Set(inherited.map((row) => row.id))
  if (parentId !== undefined && parentResolved) {
    for (const [index, entry] of (document.spec.overrides ?? []).entries())
      if (!parentIds.has(entry.id))
        diagnostics.push({
          code: 'override-unknown-id',
          path: at(`spec.overrides[${index}].id`),
          message: `override targets row id '${entry.id}', which the resolved parent does not have`,
        })
    for (const [index, row] of own.entries())
      if (parentIds.has(row.id))
        diagnostics.push({
          code: 'insert-id-collision',
          path: at(`spec.rows[${index}].id`),
          message: `row id '${row.id}' already exists in the resolved parent`,
        })
  }
  const overrideById = new Map((document.spec.overrides ?? []).map((entry) => [entry.id, entry]))
  const rows = [
    ...inherited.map((row) =>
      overrideById.has(row.id)
        ? merged(row, overrideById.get(row.id) as OverrideEntry, values)
        : row,
    ),
    ...own,
  ]
  return { rows, values }
}

/**
 * Read, validate and resolve a manifest. A Blend resolves over its Blueprint (`getBlueprint`). Throws a `ManifestError` with every
 * diagnostic when anything is invalid.
 */
export function loadManifest(file: string, options: LoadOptions = {}): ResolvedManifest {
  const read = parseFile(file)
  if (Array.isArray(read)) throw new ManifestError(file, read)
  const diagnostics = validate(read.document, options.known)
  if (diagnostics.some((d) => d.code === 'schema-error' || d.code === 'parse-error'))
    throw new ManifestError(file, diagnostics)
  const raw = read.document as Manifest
  const { rows, values } = resolveRows(raw, options, [raw.metadata.id], diagnostics)
  // A row inherited from a parent (or renamed by an override) can name a plugin this app does not have.
  if (options.known) {
    const registry = new Set(options.known)
    const own = new Set((raw.spec.rows ?? []).map((row) => row.id))
    for (const row of rows)
      if (!own.has(row.id) && !registry.has(row.use))
        diagnostics.push({
          code: 'unknown-plugin',
          path: `resolved row '${row.id}'`,
          message: `no plugin '${row.use}' in the app's registry (known: ${[...registry].join(', ')})`,
        })
  }
  if (diagnostics.length > 0) throw new ManifestError(file, diagnostics)
  return {
    ...raw,
    plugins: rows,
    values,
    digest: createHash('sha256').update(read.text).digest('hex'),
  }
}

/** What an app can mount: a Cordis plugin per name. */
export type Registry = Readonly<Record<string, unknown>>

/**
 * Mount the manifest's enabled rows in order, each with its config merged under `overrides[id]` (runtime values such as the port win),
 * awaiting each one, because a fiber still waiting on an injected service reports done too early. Returns the fibers, in order.
 */
export async function compose(
  root: Context,
  manifest: Pick<ResolvedManifest, 'plugins'>,
  registry: Registry,
  overrides: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
): Promise<Fiber[]> {
  const fibers: Fiber[] = []
  for (const row of manifest.plugins) {
    if (row.disabled) continue
    const plugin = registry[row.use]
    if (!plugin)
      throw new ManifestError('the manifest', [
        { code: 'unknown-plugin', path: row.id, message: `no plugin '${row.use}' in the registry` },
      ])
    const config = { ...(row.config ?? {}), ...(overrides[row.id] ?? {}) }
    const fiber = root.plugin(plugin as Parameters<Context['plugin']>[0], config as never)
    fibers.push(fiber)
    await fiber.await()
  }
  return fibers
}

/** The usual place for Blueprints: a folder with one `<definition id>.yaml` per Blueprint (for example `blueprints/acme.shop.yaml`). */
export function blueprintsIn(directory: string): (id: string) => string | undefined {
  return (id) => {
    const file = join(directory, `${id}.yaml`)
    return DEFINITION_ID.test(id) && existsSync(file) ? file : undefined
  }
}

export {
  type AppPluginModule,
  appPluginNames,
  libraryCopies,
  loadAppPlugins,
  PLUGIN_ENTRIES,
  pluginEntry,
} from './app-plugins.ts'
