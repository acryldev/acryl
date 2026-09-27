// Typed document model for BLEND manifests (see data-model.md for the
// exhaustive field list; fields not listed there do not exist).

export const BLENDS_API_VERSION = 'blends.acryl.dev/v1alpha1' as const

export type FormatApiVersion = typeof BLENDS_API_VERSION

export type BlendKind = 'Blueprint' | 'Blend'

export type ParameterType = 'string' | 'number' | 'boolean'

export type ParameterValue = string | number | boolean

export interface Lineage {
  blueprint: string
  blueprintVersion: string
}

export interface ParameterDeclaration {
  type: ParameterType
  default: ParameterValue
}

/** A composition row: `name` is what it loads, `id` is the addressable slot. */
export interface Row {
  id: string
  name: string
  config?: Record<string, unknown>
  disabled?: boolean
}

/**
 * An override entry: merges into an inherited row by id. `name` is optional
 * (inherits) and may be set explicitly to change what the row loads.
 */
export interface OverrideEntry {
  id: string
  name?: string
  config?: Record<string, unknown>
  disabled?: boolean
}

export interface BlendMetadata {
  id: string
  name: string
  version: string
  category?: string
  description?: string
}

export interface BlendSpec {
  runtime: string
  extends?: string
  lineage?: Lineage
  rows?: Row[]
  overrides?: OverrideEntry[]
  parameters?: Record<string, ParameterDeclaration>
}

export interface BlendDocument {
  apiVersion: FormatApiVersion
  kind: BlendKind
  metadata: BlendMetadata
  spec: BlendSpec
}

/** The spec of a resolved definition: everything not consumed by resolution. */
export interface ResolvedSpec {
  runtime: string
  lineage?: Lineage
  rows: Row[]
}

/**
 * What a definition contributed on top of its parent, kept by resolution so
 * `compileDefinition` can emit the per-definition patch (FR-016): the
 * substituted new rows and the substituted override entries. For a root
 * definition (no parent) the delta is the full row list with no overrides.
 */
export interface ResolvedDelta {
  insert: Row[]
  overrides: OverrideEntry[]
}

export interface ResolvedDefinition {
  apiVersion: FormatApiVersion
  kind: BlendKind
  metadata: BlendMetadata
  spec: ResolvedSpec
  delta: ResolvedDelta
}

/**
 * One op of compiled patch output, in the host patch vocabulary only (D12):
 * a single insert op carrying new rows, or one override op per changed
 * inherited row (`id` plus only the keys the definition sets).
 */
export interface PatchOp {
  insert?: Row[]
  id?: string
  name?: string
  config?: Record<string, unknown>
  disabled?: boolean
}

/** Deterministic compile output: the op model plus its canonical YAML form. */
export interface CompiledPatch {
  yaml: string
  ops: PatchOp[]
}

/**
 * Identity of the generator that wrote a lock file: the core library and its
 * package version (`BLENDS_CORE_VERSION`).
 */
export interface LockGenerator {
  name: string
  version: string
}

/**
 * Identity of the definition a lock's resolved state came from. `digest` is
 * the sha256 hex of the raw definition file bytes, computed by the caller:
 * the core library stays free of `node:crypto` and all host I/O.
 */
export interface LockOrigin {
  id: string
  kind: BlendKind
  version: string
  digest: string
}

/**
 * Where one module (a local source or an installed package) in a lock's
 * `modules` list came from (spec-004, FR-M4-1). `registry`: `version` plus
 * the integrity `digest` from the package manager's own lockfile. `local`:
 * `version` plus the `sha256:` digest of the vendored source tree and its
 * vendored `source` path. `git`/`linked`: the `spec` only (the location
 * stays reachable; nothing here pins its content).
 */
export type LockModuleOrigin = 'registry' | 'local' | 'git' | 'linked'

export interface LockModule {
  name: string
  origin: LockModuleOrigin
  version?: string
  spec?: string
  digest?: string
  source?: string
}

/**
 * Machine-generated lock file (governing spec 6.4, M2 D15; v2: spec-004,
 * FR-M4-1): the resolved technical state of an owned Blend. The YAML
 * manifest stays the human-facing intent; the lock is what makes the
 * project reproducible. `modules` (v2 only) records where each row's
 * package came from, on top of the resolved `rows` both versions share;
 * v1's meaning is unchanged - a v1 lock is not reinterpreted as v2 with an
 * empty `modules`, the two are simply different shapes.
 */
export type BlendLock =
  | { formatVersion: 1, generator: LockGenerator, origin: LockOrigin, rows: Row[] }
  | { formatVersion: 2, generator: LockGenerator, origin: LockOrigin, rows: Row[], modules: LockModule[] }

/**
 * Read-only summary of a definition (US4): identity, kind, lineage, ordered
 * rows, and declared parameters. Carries no config values and evaluates no
 * executable content.
 */
export interface BlendSummary {
  id: string
  kind: BlendKind
  version: string
  lineage: { blueprint: string, blueprintVersion: string } | null
  rows: { id: string, name: string, disabled: boolean }[]
  parameters: string[]
}
