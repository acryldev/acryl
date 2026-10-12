/**
 * The DSH chat's share of the workspace context (spec 043 T010): a `systemPrompt.context` contribution, the harness's dynamic context that is
 * recorded as a durable user-role snapshot per assembly (so a change does not invalidate the cached system prompt). It is keyed by the
 * session's own folder, so a chat in a Shared Context workspace is told about its projects and any other chat gets nothing.
 */

/** The share of DSH's `systemPrompt` service used here (the harness types are not a dependency of this package). */
export interface SystemPromptContextPort {
  context(context: { readonly name: string, readonly order: number, readonly text: (assembly: AssemblyLike) => string }): () => void
}

/** The share of an assembly read here: the session whose prompt is being assembled. */
export interface AssemblyLike {
  readonly agent?: { readonly session?: { readonly header?: { readonly cwd?: unknown } } }
}

export const WORKSPACE_CONTEXT_NAME = 'acryl:workspace'
/** After the harness's own runtime contexts (sandbox 110, approval 115, subagents 120). */
export const WORKSPACE_CONTEXT_ORDER = 130

/** @returns the prompt block for the session's folder, or '' (no contribution) outside a Shared Context workspace. */
export function chatContextText(contextFor: (folder: string) => { readonly prompt: string } | undefined, assembly: AssemblyLike): string {
  const cwd = assembly.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? contextFor(cwd)?.prompt ?? '' : ''
}

/** Register the contribution. @returns disposer. */
export function registerChatContext(systemPrompt: SystemPromptContextPort, contextFor: (folder: string) => { readonly prompt: string } | undefined): () => void {
  return systemPrompt.context({ name: WORKSPACE_CONTEXT_NAME, order: WORKSPACE_CONTEXT_ORDER, text: assembly => chatContextText(contextFor, assembly) })
}
