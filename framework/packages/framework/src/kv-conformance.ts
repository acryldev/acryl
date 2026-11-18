/**
 * `acrylblends/kv/conformance`: the `kv` conformance suite a provider of the port passes. It runs on the vitest your test hands it, so the package declares no vitest:
 *
 *   import * as vitest from 'vitest'
 *   describeKvConformance('my-provider', open, vitest)
 */
import { describeKvConformance as suite } from '../../../plugins/acryl-kv/src/conformance.ts'
import { bind, type VitestApi } from './vitest-binding.ts'

export type { KvUnderTest } from '../../../plugins/acryl-kv/src/conformance.ts'
export type { VitestApi }

export function describeKvConformance(
  provider: string,
  open: Parameters<typeof suite>[1],
  vitest: VitestApi,
): void {
  bind(vitest)
  suite(provider, open)
}
