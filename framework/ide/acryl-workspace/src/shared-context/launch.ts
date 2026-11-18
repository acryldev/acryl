/**
 * How a terminal agent started in a Shared Context workspace gets the context, in its own way (spec 043 T010). Only flags each agent
 * documents and its installed `--help` lists: Claude Code gets the other projects and the workspace folder (`--add-dir`) and the context
 * (`--append-system-prompt`); Pi gets the context; Codex gets the same folders (`--add-dir`) and the context as developer instructions
 * (`-c developer_instructions=...`, Codex 0.162). Every agent gets `ACRYL_WORKSPACE_CONTEXT`, the generated document's path.
 *
 * The workspace folder holds the brief, so any agent can read it and, when asked, write a handoff into it that the next agent, of any
 * kind, is started with. That is how a session moves between agents without adapting one agent to another.
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
  /** `<home>/workspaces/<id>/`: the brief and the generated document. */
  readonly workspaceFolder: string
}

/** @returns the arguments and environment a known agent is started with in a shared workspace. */
export function contextLaunch(agentId: string, context: LaunchContext): ContextLaunch {
  const env = { [WORKSPACE_CONTEXT_ENV]: context.documentPath }
  const folders = [...context.otherProjects, context.workspaceFolder]
  switch (agentId) {
    case 'claude':
      // `--add-dir` takes every folder up to the next flag.
      return { args: ['--add-dir', ...folders, '--append-system-prompt', context.prompt], env }
    case 'pi':
      return { args: ['--append-system-prompt', context.prompt], env }
    case 'codex':
      // The value is parsed as TOML; a JSON string literal is a valid TOML basic string.
      return { args: [...folders.flatMap(folder => ['--add-dir', folder]), '-c', `developer_instructions=${JSON.stringify(context.prompt)}`], env }
    default:
      return { args: [], env }
  }
}
