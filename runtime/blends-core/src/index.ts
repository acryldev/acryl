// Public surface of @acryl/blends-core (contracts/blends-core.api.md).
// Consumers (CLI in M2, desktop in M3, hub tooling later) import from here
// only. Additions are allowed; removals or shape changes require a format
// version bump (v1alpha1 discipline).
import schemaJson from './schema/blend-manifest.v1alpha1.schema.json' with { type: 'json' }

// The five contract functions.
export { parseDefinition } from './parse.js'
export { validateDefinition, type ValidationMode } from './validate.js'
export { resolveDefinition, resolutionParentOf, type ResolveOptions, type ResolveResult } from './resolve.js'
export { compileDefinition, type CompileResult } from './compile.js'
export { inspectDefinition } from './inspect.js'
export { generateLock, BLENDS_CORE_VERSION, type LockResult } from './lock.js'

// Document model and identity.
export {
  BLENDS_API_VERSION,
  type BlendDocument,
  type BlendKind,
  type BlendLock,
  type BlendMetadata,
  type BlendSpec,
  type BlendSummary,
  type CompiledPatch,
  type FormatApiVersion,
  type Lineage,
  type LockGenerator,
  type LockModule,
  type LockModuleOrigin,
  type LockOrigin,
  type OverrideEntry,
  type ParameterDeclaration,
  type ParameterType,
  type ParameterValue,
  type PatchOp,
  type ResolvedDefinition,
  type ResolvedDelta,
  type ResolvedSpec,
  type Row,
} from './document.js'

// Diagnostics (FR-012): the only failure channel.
export type { Diagnostic, DiagnosticCode } from './diagnostics.js'

// The schema artifact for hub ingest and external validators: its package
// path (the exports-map entry) and its parsed contents.
export const BLEND_MANIFEST_SCHEMA_PATH = './schema/blend-manifest.v1alpha1.schema.json' as const
/**
 * A JSON Schema document. Declared rather than inferred from the JSON import: TypeScript 6 drops the `with { type: 'json' }` attribute when it writes
 * declarations, so an inferred type made every NodeNext consumer of this package fail to typecheck (TS1543) the moment it imported it.
 */
export type BlendManifestSchema = Readonly<Record<string, unknown>>
export const BLEND_MANIFEST_SCHEMA: BlendManifestSchema = schemaJson
