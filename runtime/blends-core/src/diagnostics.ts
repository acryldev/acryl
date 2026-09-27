// Structured diagnostics: the only failure channel. Every diagnostic carries a
// location path into the source document (FR-012) - never a bare "invalid".

export type DiagnosticCode =
  | 'parse-error'
  | 'schema-error'
  | 'duplicate-row-id'
  | 'blend-without-lineage'
  | 'blueprint-with-lineage'
  | 'lineage-extends-mismatch'
  | 'js-expression-in-distribution'
  | 'dangling-parameter-reference'
  | 'unused-parameter'
  | 'parameter-override-unknown'
  | 'parameter-type-mismatch'
  | 'overrides-without-parent'
  | 'parent-not-supplied'
  | 'parent-cycle'
  | 'override-unknown-id'
  | 'insert-id-collision'

export interface Diagnostic {
  code: DiagnosticCode
  path: string
  message: string
}

export function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  return { code, path, message }
}

export const ROOT_PATH = '$'

export function joinField(base: string, key: string): string {
  return base === '' ? key : `${base}.${key}`
}

export function joinIndex(base: string, index: number): string {
  return `${base}[${index}]`
}
