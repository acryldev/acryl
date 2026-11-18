/**
 * `acrylblends/db/conformance`: the `db` conformance suite a provider of the port passes. It runs on the vitest your test hands it, so the package declares no vitest:
 *
 *   import * as vitest from 'vitest'
 *   describeDbConformance('my-provider', open, vitest)
 */
import { describeDbConformance as suite } from '../../../plugins/acryl-db/src/conformance.ts'
import { bind, type VitestApi } from './vitest-binding.ts'

export type { DbUnderTest } from '../../../plugins/acryl-db/src/conformance.ts'
export type { VitestApi }

export function describeDbConformance(
  provider: string,
  open: Parameters<typeof suite>[1],
  vitest: VitestApi,
): void {
  bind(vitest)
  suite(provider, open)
}
