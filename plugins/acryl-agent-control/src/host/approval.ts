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

/** The slice of the harness's `sandboxPolicy` service (`@deepseek-ai/dsh-sandbox-policy`) read here, declared locally for the same reason. */
interface SessionSandboxPolicy {
  resolve(request: { readonly session?: unknown }): { readonly mode: string }
}

/** The permission mode in which the user has granted every action in advance ("Full access" in the composer). */
const FULL_ACCESS_MODE = 'danger-full-access'

/**
 * The `tools/pre-execute` policy: a click, type, select or key press is asked about, every time, in words that
 * name the control. Another plugin's denial still wins; approving one call approves only that call.
 *
 * A session in full access (`danger-full-access`, "Full access" in the composer) is not asked: the user granted every action in
 * advance, as the harness's own plugin manager treats that mode ("requires danger-full-access permission or approval for this call").
 * A UI action is narrower than what that mode already allows (any shell command); protected regions, the kill switch and the audit
 * still apply.
 *
 * Otherwise, before asking, checks whether this session's approval policy would ever reach a person: under `'never'` (the harness's
 * deterministic auto-reject stance for unattended runs) the `ask` pipeline denies with "the user rejected tool ...", which is false
 * here; naming the real reason stops the agent from concluding that a person rejected a click nobody was asked to make.
 */
export function createApprovalPolicy(ctx: Context, refs: RefDirectory, approval: 'every-call' | 'none') {
  return async (exec: AcrylToolCall, next: () => Promise<AcrylToolDecision>): Promise<AcrylToolDecision> => {
    const decision = await next()
    if (approval === 'none' || !MUTATING_TOOL_NAMES.has(exec.name) || decision.kind === 'deny') return decision
    const sandbox = ctx.get('sandboxPolicy') as SessionSandboxPolicy | undefined
    if (sandbox !== undefined && exec.agent !== undefined && sandbox.resolve({ session: exec.agent.session }).mode === FULL_ACCESS_MODE) return decision
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
