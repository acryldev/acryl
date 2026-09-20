// Example: prompt-contribution.basic
// Type:     prompt-contribution
// Surfaces: tui web desktop
// Teaches:  ctx.systemPrompt.section({name, order, text}) adds a named, ordered section; the return value is its disposer.
// Expect:   ACTIVE; the section appears in the assembled system prompt.
// Docs:     extending.prompt-contribution
// Pattern:  deepseek-harness docs/subsystems/system-prompt.md
export const name = 'acryl-example-prompt'
export const inject = ['systemPrompt']

export function apply(ctx) {
  // Orders: tools are 1000-2900, SDK 5000, deliverables 9000, local paths 10000+. Keep static text static (it is cacheable).
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'example:house-style',
    order: 9200,
    text: 'House style: answer briefly and show file paths in full.',
  }))
}
