// Example: lifecycle-hooks.observer
// Type:     event-hook (lifecycle interception: before step, before request, model stream)
// Surfaces: tui web desktop
// Teaches:  the three agent-loop waterfalls pi.dev exposes as `before_agent_start`, `context` and provider-request hooks:
//           `agent/pre-step`  (payload { agent, messages, turn, step, signal }): runs before each step; `await next()` returns the decision
//                             { kind: 'enter', messages } or { kind: 'reject' }; return it unchanged to observe, or change `messages` to alter what enters.
//           `agent/request`   (payload { agent, turn, step, signal }): runs before each model request; `await next()` returns the call config
//                             (provider, model, ...); return a replacement to switch model. It cannot mutate messages.
//           `llm/stream`      (options, next): wraps the model call itself; call `next()` (optionally with changed options) and return its stream.
//           EVERY waterfall listener must call `next()` and return its result, or it cuts the rest of the chain out. These are observers: they
//           count and pass everything through. Register inside `ctx.effect`; provide the counters as a service so other code can read them.
// Expect:   row ACTIVE; `acrylLifecycleProbe.counts()` grows as the agent takes steps and makes requests.
// Docs:     extending.event-hook
// Pattern:  plugins/acryl-system-prompt/index.js (system-prompt/assemble), maps/events.md for every other event
export const name = 'acryl-example-lifecycle-hooks'

export function apply(ctx) {
  const counts = { preStep: 0, request: 0, stream: 0 }
  ctx.provide('acrylLifecycleProbe', { counts: () => ({ ...counts }) })
  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => { counts.preStep += 1; return next() }), 'lifecycle-hooks: pre-step')
  ctx.effect(() => ctx.on('agent/request', async (payload, next) => { counts.request += 1; return next() }), 'lifecycle-hooks: request')
  ctx.effect(() => ctx.on('llm/stream', (options, next) => { counts.stream += 1; return next() }), 'lifecycle-hooks: stream')
}
