// Example: service.consumer
// Type:     service-consumer
// Surfaces: tui web desktop
// Teaches:  `inject` is a HARD dependency: PENDING until a provider exists, ACTIVE by itself when it does. `ctx.get` is the optional form.
// Expect:   PENDING alone; ACTIVE once service-provider-greeter is installed.
// Docs:     extending.service
// Pattern:  handbook part 6
export const name = 'acryl-example-greeter-consumer'
export const inject = ['greeter']

export function apply(ctx) {
  ctx.logger.info(`[greeter-consumer] ${ctx.greeter.greet('consumer')}`)
  // Optional dependency instead: const g = ctx.get('greeter'); if (g) { ... }  (never PENDING)
}
