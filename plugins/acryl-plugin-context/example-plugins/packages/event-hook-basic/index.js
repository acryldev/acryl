// Example: event-hook.basic
// Type:     event-hook
// Surfaces: tui web desktop
// Teaches:  ctx.on registers a listener that Cordis removes when the fiber unloads; ctx.emit broadcasts; a waterfall listener MUST call next().
// Expect:   ACTIVE; logs "heard example/hello: world".
// Docs:     extending.event-hook
// Pattern:  handbook part 7
export const name = 'acryl-example-event-hook'

export function apply(ctx) {
  ctx.on('example/hello', who => {
    ctx.logger.info(`[event-hook] heard example/hello: ${who}`)
  })
  // A waterfall observer must call next(), otherwise it swallows the downstream default:
  //   ctx.on('example/transform', async (input, next) => { const out = await next(); return out.trim() })
  ctx.emit('example/hello', 'world')
}
