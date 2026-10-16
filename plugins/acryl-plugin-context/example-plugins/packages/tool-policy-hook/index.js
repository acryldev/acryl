// Example: tool-policy-hook.deny
// Type:     event-hook (lifecycle interception: tool execution)
// Surfaces: tui web desktop
// Teaches:  a TOOL POLICY, the harness's equivalent of pi.dev's `tool_call` interception. The `tools/pre-execute` waterfall runs before every tool
//           call with the pending execution `{ callId, name, arguments, agent, ... }` and must return a decision: `{ kind: 'allow' }`,
//           `{ kind: 'deny', reason }` (the model gets an error result carrying your reason and can change course) or `{ kind: 'ask', reason? }`
//           (routes to the approval flow; without approval support it becomes a denial). `await next()` yields the decision the rest of the chain
//           would make (allow by default): return it unchanged for calls you do not care about, so other policies and the approval preset still
//           apply. Related: `tools/post-execute` (accept, replace or block a result), `tools/execute` (wrap the call: timeout, retry, metrics),
//           `tools/result` (observe the final outcome). Policies are security relevant: keep them small, fail closed, say what they block.
// Expect:   row ACTIVE; calls to a tool named in `blocked` are denied with the reason; every other call is untouched.
// Docs:     extending.event-hook
// Pattern:  deepseek-harness/docs/reference (harness/tool-execution-pipeline.md), maps/events.md ("tools/pre-execute")
import Schema from '@deepseek-ai/schemastery'

export const name = 'acryl-example-tool-policy'

export const Config = Schema.object({
  blocked: Schema.array(Schema.string()).default(['example_forbidden']).description('Tool names to deny.'),
  reason: Schema.string().default('This tool is blocked by the ACRYL example tool policy.').description('What the model is told.'),
})

export function apply(ctx, config) {
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    if (config.blocked.includes(exec.name)) return { kind: 'deny', reason: `${config.reason} (tool: ${exec.name})` }
    return next()
  }), 'acryl-example-tool-policy: pre-execute')
}
