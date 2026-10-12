/**
 * How a terminal agent started in a Shared Context workspace gets the context, in its own way (spec 043 T010). Only flags each agent
 * documents and its installed `--help` lists: Claude Code reads the other projects (`--add-dir`) and the context (`--append-system-prompt`);
 * Pi gets the context; Codex gets the other projects (no flag for extra instructions was confirmed). Every agent gets
 * `ACRYL_WORKSPACE_CONTEXT`, the generated document's path.
 */

/** The environment variable naming the workspace's generated context document. */
export const WORKSPACE_CONTEXT_ENV = 'ACRYL_WORKSPACE_CONTEXT'

export interface ContextLaunch {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

export interface LaunchContext {
  readonly prompt: string
  readonly documentPath: string
  readonly otherProjects: readonly string[]
}

/** @returns the arguments and environment a known agent is started with in a shared workspace. */
export function contextLaunch(agentId: string, context: LaunchContext): ContextLaunch {
  const env = { [WORKSPACE_CONTEXT_ENV]: context.documentPath }
  switch (agentId) {
    case 'claude':
      return {
        // `--add-dir` takes every folder up to the next flag.
        args: [...(context.otherProjects.length === 0 ? [] : ['--add-dir', ...context.otherProjects]), '--append-system-prompt', context.prompt],
        env,
      }
    case 'pi':
      return { args: ['--append-system-prompt', context.prompt], env }
    case 'codex':
      return { args: context.otherProjects.flatMap(folder => ['--add-dir', folder]), env }
    default:
      return { args: [], env }
  }
}
