/** Per-call approval for the tools that change the page, through the harness's own policy pipeline. */

import type { Context } from '@deepseek-ai/cordis'
import type { AcrylToolCall, AcrylToolDecision } from 'acryl-control'
import { describeCall, MUTATING_TOOL_NAMES, type RefDirectory } from './tools.ts'

/**
 * The narrow slice of the harness's own `@deepseek-ai/dsh-user-approval` service this package reads, declared
 * locally instead of taking a dependency on that package for one check (same pattern `acryl-workspace`'s own
 * `contracts.ts` uses for slot keys it only reads, not owns).
 */
interface SessionApprovalPolicy {
  readonly config: { readonly policy: 'ask' | 'never' }
  overrideOf(session: unknown): 'ask' | 'never' | undefined
}

/**
 * The `tools/pre-execute` policy: a click, type, select or key press is asked about, every time, in words that
 * name the control. Another plugin's denial still wins; approving one call approves only that call.
 *
 * Before asking, checks whether this session's approval policy would ever actually reach a person: under
 * `'never'` (the deployment's deterministic auto-reject stance, e.g. a "danger-full-access"/unattended
 * permission mode), the harness's own `ask` pipeline silently denies with `"the user rejected tool ..."` -
 * text that is true of a real click and false of this, and was mistaken for one live (2026-10-01: an owner
 * report with a screenshot showing no prompt at all, "the permission is missing"). Naming the real reason
 * here stops that agent from concluding a person rejected a click nobody was ever asked to make.
 */
export function createApprovalPolicy(ctx: Context, refs: RefDirectory, approval: 'every-call' | 'none') {
  return async (exec: AcrylToolCall, next: () => Promise<AcrylToolDecision>): Promise<AcrylToolDecision> => {
    const decision = await next()
    if (approval === 'none' || !MUTATING_TOOL_NAMES.has(exec.name) || decision.kind === 'deny') return decision
    const reason = describeCall(exec.name, exec.arguments, refs)
    const approvalService = ctx.get('approval') as SessionApprovalPolicy | undefined
    if (approvalService !== undefined && exec.agent !== undefined) {
      const policy = approvalService.overrideOf(exec.agent.session) ?? approvalService.config.policy
      if (policy === 'never') {
        return { kind: 'deny', reason: `${reason} - this session's permission mode rejects every approval-requiring action automatically, with no prompt; switch out of it (or set this plugin's own "approval" to "none" for unattended tests) to drive the UI here.` }
      }
    }
    return { kind: 'ask', reason }
  }
}
