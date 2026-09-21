// Example: capability.swap-provider-loud
// Type:     three-role-capability
// Surfaces: tui web desktop
// Teaches:  ROLE 2 of 3 (provider). The capability is the service NAME `speller` with the method shape
//           `shout(text: string): string` (ROLE 1, the definition: a name plus a documented contract, not code).
//           Provider A. Provider B is `capability-swap-provider-quiet`; mount only ONE at a time (a second
//           `speller` provider is rejected). The consumer is `capability-swap-consumer`.
// Expect:   row ACTIVE; ctx.speller.shout('hi') === 'HI!'.
// Swap:     disable this row and enable the quiet one; the consumer remounts against the new provider unchanged.
// Docs:     extending.service
import { Service } from '@deepseek-ai/cordis'

export const name = 'acryl-example-speller-loud'

export class LoudSpeller extends Service {
  constructor(ctx) { super(ctx, 'speller') }
  shout(text) { return `${String(text).toUpperCase()}!` }
}

export { LoudSpeller as apply }
