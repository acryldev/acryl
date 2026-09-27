/** Per-call approval for the tools that change the page, through the harness's own policy pipeline. */

import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { describeCall, MUTATING_TOOL_NAMES, type RefDirectory } from './tools.ts'

/**
 * The `tools/pre-execute` policy: a click, type, select or key press is asked about, every time, in words that
 * name the control. Another plugin's denial still wins; approving one call approves only that call.
 */
export function createApprovalPolicy(refs: RefDirectory, approval: 'every-call' | 'none') {
  return async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    const decision = await next()
    if (approval === 'none' || !MUTATING_TOOL_NAMES.has(exec.name) || decision.kind === 'deny') return decision
    return { kind: 'ask', reason: describeCall(exec.name, exec.arguments, refs) }
  }
}
