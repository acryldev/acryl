/**
 * `acryl_workspace_context` (spec 043 T011): any agent reads a Shared Context workspace's context, through the tool registry the DSH chat
 * uses and, for agents ACRYL does not run, the loopback tool gateway (it is on the gateway's default allowlist). Reading only.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineAcrylTool } from 'acryl-control'
import type { ProjectRegistryView } from '../projects/contract.ts'

export const WORKSPACE_CONTEXT_TOOL = 'acryl_workspace_context'

export interface ContextToolValue {
  readonly workspace: string
  readonly shared: boolean
  readonly text: string
}

export interface ContextToolDeps {
  view(): ProjectRegistryView
  promptFor(id: string): string | undefined
}

/** @returns the value for a workspace id, the shown one by default. */
export function readWorkspaceContext(deps: ContextToolDeps, id?: string): ContextToolValue {
  const view = deps.view()
  const workspace = id ?? view.current
  if (!view.workspaces.some(candidate => candidate.id === workspace)) throw new Error(`there is no workspace ${workspace}; call acryl_workspace_list`)
  const text = deps.promptFor(workspace)
  return text === undefined
    ? { workspace, shared: false, text: 'This workspace does not share context: its projects are separate.' }
    : { workspace, shared: true, text }
}

/** @returns disposer. */
export function registerContextTool(ctx: Context, deps: ContextToolDeps): () => void {
  return ctx.acrylTools.register(defineAcrylTool({
    name: WORKSPACE_CONTEXT_TOOL,
    description: 'Read a shared-context workspace\'s projects and brief (default: the shown workspace).',
    parameters: { workspace: { type: 'string' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { workspace: { type: 'string', required: true }, shared: { type: 'boolean', required: true }, text: { type: 'string', required: true } },
      },
      render: (_args, value: ContextToolValue) => [{ type: 'text', text: value.text }],
    },
    execute: args => readWorkspaceContext(deps, args.workspace),
  }))
}
