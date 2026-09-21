// Example: capability.swap-consumer
// Type:     three-role-capability
// Surfaces: tui web desktop
// Teaches:  ROLE 3 of 3 (consumer). Depends on the service NAME only (`inject: ['speller']`), never on a
//           provider package, so either provider works and a swap needs no change here. While no provider
//           is mounted this row is PENDING (healthy); it goes ACTIVE when one is, and remounts on a swap.
// Expect:   PENDING with no provider; ACTIVE with either provider.
// Docs:     extending.service
export const name = 'acryl-example-speller-consumer'
export const inject = ['speller']

export function apply(ctx) {
  ctx.logger.info(`[speller-consumer] ${ctx.speller.shout('hello')}`)
}
