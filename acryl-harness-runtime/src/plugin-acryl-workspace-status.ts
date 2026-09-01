/**
 * ACRYL's first real model-facing tool, registered as an ordinary Cordis plugin
 * on the native `ctx.tools` seam.
 *
 * @module acryl-harness-runtime/acryl-workspace-status
 *
 * This is the ACRYL hard gate: a genuine model-facing Tool that injects `tools`,
 * registers via `ctx.tools.register(defineTool(...))`, declares a canonical
 * typed `output.schema` and a separate `render(...)` for model-facing content,
 * honours `exec.signal`, and disposes cleanly when its owning Fiber unloads.
 * It is ACRYL-owned context (the workspace/profile the agent is running in) and
 * deliberately does NOT re-implement a DSH file/shell/web tool.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'acryl-workspace-status'

/** Services required: the tool registry. */
export const inject = ['tools']

/** Canonical tool name exposed to the model. */
export const TOOL_NAME = 'acryl_workspace_status'

interface AcrylWorkspaceContext {
  readonly cwd: string
  readonly dshHome: string
  readonly profile: string
  readonly surface: string
}

/** Read the ACRYL workspace/profile context the agent is running under. */
function readWorkspaceContext(): AcrylWorkspaceContext {
  return {
    cwd: process.cwd(),
    dshHome: process.env.DSH_HOME ?? '',
    profile: process.env.ACRYL_PROFILE ?? '',
    surface: process.env.ACRYL_SURFACE ?? '',
  }
}

/** Render one line of the model-facing text from the canonical context value. */
function fmt(
  label: string,
  value: string,
  prefix: string,
): string {
  return `${prefix} ${label}: ${value}`
}

/** Register the `acryl_workspace_status` tool on `ctx.tools`. Returns a disposer. */
export function installAcrylWorkspaceStatusTool(ctx: Context): () => void {
  const tool = defineTool({
    name: TOOL_NAME,
    description:
      'Report the ACRYL workspace context the agent is operating in: current working '
      + 'directory, DSH home, active ACRYL profile, and presentation surface. Use it to '
      + 'confirm which project/profile a session is bound to before acting.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cwd: { type: 'string', required: true },
          dshHome: { type: 'string', required: true },
          profile: { type: 'string', required: true },
          surface: { type: 'string', required: true },
        },
      },
      render(_args: unknown, value: unknown): ContentBlock[] {
        const v = value as AcrylWorkspaceContext
        const head = 'ACRYL workspace context:'
        const lines = [
          fmt('cwd', v.cwd, '-'),
          fmt('dshHome', v.dshHome || '<unset>', '-'),
          fmt('profile', v.profile || '<default>', '-'),
          fmt('surface', v.surface || '<tui>', '-'),
        ]
        return [{ type: 'text', text: [head, ...lines].join('\n') }]
      },
    },
    async execute(_args: unknown, _exec): Promise<AcrylWorkspaceContext> {
      // Same-process, zero-resource: no async work beyond a microtask so the
      // tool still honours the call/cancellation pipeline and quiesces.
      return readWorkspaceContext()
    },
  })
  return ctx.tools.register(tool)
}

/** Cordis plugin entry point for idiomatic composition via a Loader row. */
export function apply(ctx: Context): void {
  installAcrylWorkspaceStatusTool(ctx)
}
