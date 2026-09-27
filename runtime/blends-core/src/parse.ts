// parseDefinition: YAML text -> document + diagnostics. Never throws for
// unparseable input (FR-001); parse failures are `parse-error` diagnostics
// rooted at `$` with the parser's own location-bearing message. Callers
// prepend the file label.
import { parseDocument } from 'yaml'

import { diagnostic, ROOT_PATH, type Diagnostic } from './diagnostics.js'
import { jsExprTags } from './js-expr.js'

export interface ParseResult {
  document: unknown
  diagnostics: Diagnostic[]
}

export function parseDefinition(source: string): ParseResult {
  const doc = parseDocument(source, { customTags: jsExprTags })
  if (doc.errors.length > 0) {
    return {
      document: undefined,
      diagnostics: doc.errors.map((error) =>
        diagnostic('parse-error', ROOT_PATH, String(error.message)),
      ),
    }
  }
  if (doc.contents === null) {
    return {
      document: undefined,
      diagnostics: [diagnostic('parse-error', ROOT_PATH, 'document is empty')],
    }
  }
  return { document: doc.toJS({ maxAliasCount: -1 }), diagnostics: [] }
}
