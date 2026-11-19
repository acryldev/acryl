// Example: config-schema.basic
// Type:     config-schema
// Surfaces: tui web desktop
// Teaches:  export a Schemastery `Config`; the Loader validates it BEFORE apply runs, so a bad config fails the whole mount.
// Expect:   valid config ACTIVE; {intervalMs: 10} FAILED with a real validation error.
// Docs:     extending.config-schema
// Pattern:  handbook part 8
import Schema from '@deepseek-ai/schemastery'

export const name = 'acryl-example-config'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello'),
  intervalMs: Schema.number().min(100).max(60_000).step(1).default(5_000),
})

export function apply(ctx, config) {
  ctx.logger.info(`[config] greeting="${config.greeting}" intervalMs=${config.intervalMs}`)
}
