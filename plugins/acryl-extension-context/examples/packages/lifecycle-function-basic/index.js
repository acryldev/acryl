// Example: lifecycle-function.basic
// Type:     lifecycle-function
// Surfaces: tui web desktop
// Teaches:  the smallest plugin: named exports `name` and `apply`. It has no
//           dependencies, provides nothing, and owns no resources.
// Expect:   its row is ACTIVE as soon as the profile loads; logs once.
// Docs:     start.this-runtime
export const name = 'acryl-example-lifecycle-function'

export function apply(ctx) {
  ctx.logger.info('[acryl-example-lifecycle-function] mounted')
}
