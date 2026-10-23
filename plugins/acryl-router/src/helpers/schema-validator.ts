import type { Env, MiddlewareHandler, ValidationTargets } from '../core/types.ts'
import { validator } from '../core/validator/index.ts'

/** The slice of the Standard Schema interface this needs; Schemastery (what Cordis uses), Zod and Valibot all implement it. */
export interface StandardSchema<T = unknown> {
  readonly '~standard': {
    validate(value: unknown): StandardResult<T> | Promise<StandardResult<T>>
  }
}

type StandardResult<T> =
  | { readonly value: T, readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string, readonly path?: readonly unknown[] | undefined }[] }

const pathOf = (path: readonly unknown[] | undefined): string =>
  (path ?? []).map(part => String(typeof part === 'object' && part !== null && 'key' in part ? (part as { key: unknown }).key : part)).join('.')

/**
 * The core `validator` driven by a Standard Schema. A failure answers 400 with `{ error, issues }`; success makes the parsed value the
 * handler's `c.req.valid(target)`, typed by the schema.
 */
export function schemaValidator<Target extends keyof ValidationTargets, Out, E extends Env = Env, P extends string = string>(
  target: Target,
  schema: StandardSchema<Out>,
): MiddlewareHandler<E, P, { in: { [K in Target]: Out }, out: { [K in Target]: Out } }> {
  const middleware = validator(target, async (value, c) => {
    const result = await schema['~standard'].validate(value)
    if (result.issues !== undefined) {
      return c.json({ error: `invalid ${target}`, issues: result.issues.map(issue => ({ message: issue.message, path: pathOf(issue.path) })) }, 400)
    }
    return result.value
  })
  // The core infers its own input and output types from the function; the schema's output type is the one a handler should see.
  return middleware as unknown as MiddlewareHandler<E, P, { in: { [K in Target]: Out }, out: { [K in Target]: Out } }>
}
