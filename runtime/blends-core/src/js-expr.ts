// `!!js` handling: the trust-boundary seam (D4).
//
// `!!js` and `!!js/inline` scalars parse into `{ __jsExpr: code }` markers -
// the same wire shape the pinned host loader produces, without importing it.
// Distribution-mode validation rejects any marker (FR-010); evaluation
// happens only in local-authoring pipelines, at compile time (US3 scenario 3).
//
// Supported tags: `!!js` and `!!js/inline` with an expression scalar. Other
// `!!js/*` tags (functions, constructors) are not part of v0.1 and fail at
// parse time as `parse-error`.

export interface JsExpr {
  readonly __jsExpr: string
}

export function makeJsExpr(code: string): JsExpr {
  return { __jsExpr: code }
}

export function isJsExpr(value: unknown): value is JsExpr {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__jsExpr' in value &&
    typeof (value as Record<string, unknown>)['__jsExpr'] === 'string' &&
    Object.keys(value).length === 1
  )
}

export const jsExprTags = [
  {
    tag: 'tag:yaml.org,2002:js',
    resolve: (value: string): JsExpr => makeJsExpr(value),
  },
  {
    tag: 'tag:yaml.org,2002:js/inline',
    resolve: (value: string): JsExpr => makeJsExpr(value),
  },
]

/**
 * Evaluate an expression in local-authoring mode. Scope is deliberately
 * minimal: `process` only. A failing expression is an authoring error in
 * trusted local mode and throws (it is not input handling).
 */
export function evaluateJsExpr(code: string): unknown {
  const evaluate = new Function('process', `'use strict'; return (${code});`)
  return evaluate(process)
}
