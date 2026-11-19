/** The `drivers` service of the agent panel: the registry (the `@acryldev/drivers` package, published as `acrylblends/drivers`) provided on a Cordis context, and the `ctx.drivers` type. */

import { createDrivers, type Drivers } from '@acryldev/drivers'
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    drivers: Drivers
  }
}

/** Provide the registry on `ctx` (the panel does). */
export function provideDrivers(ctx: Context, authorized: (headers: Headers) => boolean): Drivers {
  const registry = createDrivers(authorized)
  ;(ctx as Context).provide('drivers', registry)
  return registry
}
