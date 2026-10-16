// Example: prompt-assemble-hook.basic
// Type:     event-hook (lifecycle interception: prompt construction)
// Surfaces: tui web desktop
// Teaches:  hook the moment the system prompt is assembled, the way pi.dev's `before_agent_start` lets an extension customize the prompt. The
//           harness emits `system-prompt/assemble` as a WATERFALL: `ctx.on('system-prompt/assemble', async (assembly, context, next) => ...)`.
//           Call `next()` to get the assembly the rest of the chain built (`{ sections, contexts, tools, variables }`), change what you want, and
//           RETURN it: the returned value is authoritative. A listener that does not call `next()` cuts every other plugin out of the prompt, so
//           always `await next()`. Here we append one section; `acryl-system-prompt` uses the same hook to tag every section. Register inside
//           `ctx.effect` so the section leaves with the plugin. Other lifecycle hooks (`agent/pre-step`, `agent/request`, `llm/stream`, session
//           events) are listed in maps/events.md.
// Expect:   row ACTIVE; the assembled prompt gains a section named `example:note`.
// Docs:     extending.event-hook
// Pattern:  plugins/acryl-system-prompt/index.js
export const name = 'acryl-example-prompt-hook'
export const inject = ['systemPrompt']

export function apply(ctx) {
  ctx.effect(() => ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return { ...assembled, sections: [...assembled.sections, { name: 'example:note', text: '<example_note>\nThis line was added by an example plugin through the system-prompt/assemble hook.\n</example_note>' }] }
  }), 'acryl-example-prompt-hook: assemble listener')
}
