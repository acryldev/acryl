/**
 * Agent Control's workspace tools (spec 043 T007, spec 041's `workspace.*` vocabulary): typed tools provided by the package that owns the
 * project registry, so an agent lists, switches and creates workspaces and adds projects through the same registry the sidebar uses, with
 * its rules and refusals. Every open page follows the change through the registry's event stream. Creating a workspace and adding a
 * project are asked about every time; listing and switching are not (switching only changes what the sidebar shows, and is undone the same way).
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineAcrylTool, type AcrylToolCall, type AcrylToolDecision } from 'acryl-control'
import { WORKSPACE_KINDS, type ProjectRegistryView, type WorkspaceKind, type WorkspaceSummary } from './contract.ts'
import type { ProjectRegistry } from './registry.ts'

export const WORKSPACE_LIST_TOOL = 'acryl_workspace_list'
export const WORKSPACE_SWITCH_TOOL = 'acryl_workspace_switch'
export const WORKSPACE_CREATE_TOOL = 'acryl_workspace_create'
export const WORKSPACE_ADD_PROJECT_TOOL = 'acryl_workspace_add_project'

/** The registry's view as the tools return it: every workspace, and which one is shown. */
export interface WorkspacesValue {
  readonly current: string
  readonly workspaces: readonly WorkspaceSummary[]
}

const WORKSPACES_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    current: { type: 'string', required: true },
    workspaces: {
      type: 'array', required: true,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string', required: true }, name: { type: 'string', required: true }, kind: { type: 'string', required: true },
          projects: { type: 'array', required: true, items: { type: 'string' } },
          remote: { type: 'object', additionalProperties: false, properties: { host: { type: 'string', required: true }, user: { type: 'string' }, path: { type: 'string' } } },
        },
      },
    },
  },
} as const

const value = (view: ProjectRegistryView): WorkspacesValue => ({ current: view.current, workspaces: view.workspaces })

/** What the model reads: one line per workspace, the shown one marked. */
export function renderWorkspaces(view: WorkspacesValue): string {
  return view.workspaces.map((workspace) => {
    const projects = workspace.projects.length === 0 ? 'no projects' : workspace.projects.join(', ')
    const remote = workspace.remote === undefined ? '' : ` (SSH ${workspace.remote.user === undefined ? '' : `${workspace.remote.user}@`}${workspace.remote.host})`
    return `${workspace.id === view.current ? '* ' : '  '}${workspace.name} [${workspace.id}, ${workspace.kind}]${remote}: ${projects}`
  }).join('\n')
}

function isKind(candidate: string): candidate is WorkspaceKind {
  return (WORKSPACE_KINDS as readonly string[]).includes(candidate)
}

/** Words for the approval prompt. */
export function describeWorkspaceChange(name: string, args: unknown, view: ProjectRegistryView): string {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
  if (name === WORKSPACE_CREATE_TOOL) return `Create the workspace "${String(a.name)}" (${String(a.kind ?? 'individual')}) and show it`
  const shown = view.workspaces.find(workspace => workspace.id === view.current)?.name ?? view.current
  return `Add the folder ${String(a.path)} to the workspace "${shown}"`
}

/** Register the four tools and the approval for the two that add something. @returns disposer. */
export function registerWorkspaceTools(ctx: Context, registry: ProjectRegistry): () => void {
  const output = { schema: WORKSPACES_SCHEMA, render: (_args: unknown, view: WorkspacesValue) => [{ type: 'text' as const, text: renderWorkspaces(view) }] }

  const list = defineAcrylTool({
    name: WORKSPACE_LIST_TOOL,
    description: 'List the workspaces (sets of project folders in the sidebar), their projects, and the shown one (*).',
    parameters: {},
    output,
    execute: () => value(registry.view()),
  })

  const switchTo = defineAcrylTool({
    name: WORKSPACE_SWITCH_TOOL,
    description: 'Show another workspace by id (from acryl_workspace_list).',
    parameters: { id: { type: 'string', required: true } },
    output,
    execute: async args => value(await registry.switchWorkspace(args.id)),
  })

  const create = defineAcrylTool({
    name: WORKSPACE_CREATE_TOOL,
    description: 'Create a workspace and show it. kind: individual (default), shared (projects share context) or remote (SSH: host, optional user and path).',
    parameters: {
      name: { type: 'string', required: true },
      kind: { type: 'string' },
      host: { type: 'string' },
      user: { type: 'string' },
      path: { type: 'string' },
    },
    output,
    execute: async (args) => {
      const kind = args.kind ?? 'individual'
      if (!isKind(kind)) throw new Error(`unknown workspace kind "${kind}"; use individual, shared or remote`)
      const remote = kind === 'remote'
        ? { host: args.host ?? '', ...(args.user === undefined ? {} : { user: args.user }), ...(args.path === undefined ? {} : { path: args.path }) }
        : undefined
      return value(await registry.createWorkspace({ name: args.name, kind, ...(remote === undefined ? {} : { remote }) }))
    },
  })

  const addProject = defineAcrylTool({
    name: WORKSPACE_ADD_PROJECT_TOOL,
    description: 'Add a folder (absolute path) as a project of the shown workspace.',
    parameters: { path: { type: 'string', required: true } },
    output,
    execute: async args => value(await registry.add(args.path)),
  })

  const disposers = [list, switchTo, create, addProject].map(tool => ctx.acrylTools.register(tool))
  const removePolicy = ctx.acrylTools.policy(async (exec: AcrylToolCall, next: () => Promise<AcrylToolDecision>): Promise<AcrylToolDecision> => {
    const decision = await next()
    if ((exec.name !== WORKSPACE_CREATE_TOOL && exec.name !== WORKSPACE_ADD_PROJECT_TOOL) || decision.kind === 'deny') return decision
    return { kind: 'ask', reason: describeWorkspaceChange(exec.name, exec.arguments, registry.view()) }
  })
  return () => { removePolicy(); for (const dispose of disposers.reverse()) dispose() }
}
