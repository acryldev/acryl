/**
 * The conformance suites (`acrylblends/db/conformance`, `acrylblends/kv/conformance`) run on the test runner's own vitest, which the test hands them. In the package build their
 * `import ... from 'vitest'` is pointed here (`tsdown.config.ts`), so the package imports no vitest and does not declare one: it cannot put vitest, vite, rolldown or lightningcss into
 * a production install, and the suite can never see a second copy of vitest that is not the one running the test.
 */

/** The four functions of vitest the suites use; a test passes `import * as vitest from 'vitest'`. */
export interface VitestApi {
  readonly afterEach: (...args: never[]) => unknown
  readonly describe: (...args: never[]) => unknown
  readonly expect: (...args: never[]) => unknown
  readonly it: (...args: never[]) => unknown
}

let bound: VitestApi | undefined

/** Use `api` for the suites that run next. They register their cases synchronously, so one call per suite is enough. */
export function bind(api: VitestApi | undefined): void {
  if (
    api === undefined ||
    typeof api.describe !== 'function' ||
    typeof api.it !== 'function' ||
    typeof api.expect !== 'function' ||
    typeof api.afterEach !== 'function'
  ) {
    throw new Error(
      "the conformance suite needs the vitest your tests run on: pass it as the third argument, `import * as vitest from 'vitest'` then `describeKvConformance(name, open, vitest)`",
    )
  }
  bound = api
}

const use = (): VitestApi => {
  if (bound === undefined) throw new Error('the conformance suite ran before it was given vitest')
  return bound
}

export const afterEach = (...args: unknown[]): unknown => Reflect.apply(use().afterEach, undefined, args)
export const describe = (...args: unknown[]): unknown => Reflect.apply(use().describe, undefined, args)
export const expect = (...args: unknown[]): unknown => Reflect.apply(use().expect, undefined, args)
export const it = (...args: unknown[]): unknown => Reflect.apply(use().it, undefined, args)
