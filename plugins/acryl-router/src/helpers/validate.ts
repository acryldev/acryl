import { HttpError } from '../http-error.ts'
import type { Middleware, RouteContext } from '../types.ts'
import { readJson } from './read-body.ts'

/** The slice of the Standard Schema interface this needs; Schemastery (what Cordis uses), Zod and Valibot all implement it. */
export interface StandardSchema<T = unknown> {
  readonly '~standard': {
    validate(value: unknown): StandardResult<T> | Promise<StandardResult<T>>
  }
}

type StandardResult<T> =
  | { readonly value: T, readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string, readonly path?: readonly unknown[] | undefined }[] }

export type ValidationTarget = 'json' | 'query' | 'param'

const key = (target: ValidationTarget): string => `valid:${target}`

/**
 * Validate part of the request against a schema before the handler runs. A failure is a 400 with the issues; success stores the
 * parsed value, which the handler reads with `valid(c, target)`. `json` reads the body within the limit; `query` is the first value of each query
 * parameter; `param` is the matched path parameters.
 */
export function validate<T>(target: ValidationTarget, schema: StandardSchema<T>): Middleware {
  return async (c, next) => {
    const input = target === 'json' ? await readJson(c) : target === 'query' ? c.query() : { ...c.param() }
    const result = await schema['~standard'].validate(input)
    if (result.issues !== undefined) {
      throw new HttpError(400, {
        response: c.json({ error: `invalid ${target}`, issues: result.issues.map(issue => ({ message: issue.message, path: (issue.path ?? []).map(part => String(typeof part === 'object' && part !== null && 'key' in part ? (part as { key: unknown }).key : part)).join('.') })) }, 400),
      })
    }
    c.set(key(target), result.value)
    return next()
  }
}

/** The value `validate(target, schema)` stored. Throws if that middleware did not run on this route. */
export function valid<T>(c: RouteContext, target: ValidationTarget): T {
  const value = c.get<T>(key(target))
  if (value === undefined) throw new Error(`valid("${target}"): no validate("${target}", schema) ran before this handler`)
  return value
}
