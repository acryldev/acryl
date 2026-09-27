// inspectDefinition: read-only summary (US4, FR-011). Evaluates nothing:
// !!js content is reported, never run. Works on validated documents and
// throws only on a value that fails the type check (programmer error, not
// input handling).
import type { BlendDocument, BlendSummary } from './document.js'

export function inspectDefinition(document: BlendDocument): BlendSummary {
  assertDocumentShape(document)
  return {
    id: document.metadata.id,
    kind: document.kind,
    version: document.metadata.version,
    lineage: document.spec.lineage ?? null,
    rows: (document.spec.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      // Reported as authored; a !!js expression here is not evaluated.
      disabled: row.disabled === true,
    })),
    parameters: Object.keys(document.spec.parameters ?? {}),
  }
}

function assertDocumentShape(document: BlendDocument): void {
  const value = document as unknown as Record<string, unknown>
  const fail = (reason: string): never => {
    throw new TypeError(`inspectDefinition requires a BlendDocument: ${reason}`)
  }
  if (typeof value.apiVersion !== 'string') fail('string apiVersion missing')
  if (value.kind !== 'Blueprint' && value.kind !== 'Blend') {
    fail("kind must be 'Blueprint' or 'Blend'")
  }
  const metadata = value.metadata
  if (metadata === null || typeof metadata !== 'object') fail('metadata map missing')
  const meta = metadata as Record<string, unknown>
  if (typeof meta.id !== 'string') fail('string metadata.id missing')
  if (typeof meta.name !== 'string') fail('string metadata.name missing')
  if (typeof meta.version !== 'string') fail('string metadata.version missing')
  const spec = value.spec
  if (spec === null || typeof spec !== 'object') fail('spec map missing')
  if (typeof (spec as Record<string, unknown>).runtime !== 'string') fail('string spec.runtime missing')
}
