/**
 * The project registry's wire contract. A project is a folder the user added to ACRYL; ACRYL owns the list (it lives in the ACRYL home through
 * `acryl-settings`), and the DeepSeek Harness chat's workspaces follow it one way: a chat registers the folder it runs in when it starts, never the other
 * way round.
 */

export const WORKSPACE_PROJECTS_PATH = '/api/acryl-workspace/projects'
/** A server-sent event stream of the registry's view: one message now, then one per change (an agent's tool call, another window). */
export const WORKSPACE_PROJECTS_EVENTS_PATH = '/api/acryl-workspace/projects/events'

/** How a workspace is organized (spec 043): separate projects, projects that share context with every agent, or a remote machine. */
export type WorkspaceKind = 'individual' | 'shared' | 'remote'

export const WORKSPACE_KINDS: readonly WorkspaceKind[] = ['individual', 'shared', 'remote']

/** The workspace every app has: it cannot be deleted, and the folders added before workspaces existed are its projects. */
export const DEFAULT_WORKSPACE_ID = 'default'

/** One workspace as the page sees it. */
export interface WorkspaceSummary {
  readonly id: string
  readonly name: string
  readonly kind: WorkspaceKind
  /** Absolute folder paths, in the order they were added. */
  readonly projects: readonly string[]
  /** For a remote workspace: the SSH target saved for the connection that comes later. */
  readonly remote?: { readonly host: string, readonly user?: string, readonly path?: string }
}

export interface ProjectRegistryView {
  /** The shown workspace's folders, in the order the user added them. */
  readonly paths: readonly string[]
  /** The projects that already existed as DSH workspaces were taken over once (see `adopt`). */
  readonly adopted: boolean
  /** Every workspace, Default first. */
  readonly workspaces: readonly WorkspaceSummary[]
  /** The id of the workspace the sidebar shows. */
  readonly current: string
}

export type ProjectRequest =
  | { readonly op: 'add'; readonly path: string }
  | { readonly op: 'remove'; readonly path: string }
  /** Take over folders that were registered before ACRYL owned the list. Applied once; later calls change nothing. */
  | { readonly op: 'adopt'; readonly paths: readonly string[] }
  | { readonly op: 'create-workspace'; readonly name: string; readonly kind: WorkspaceKind; readonly remote?: { readonly host: string, readonly user?: string, readonly path?: string } }
  | { readonly op: 'switch-workspace'; readonly id: string }
  | { readonly op: 'rename-workspace'; readonly id: string; readonly name: string }
  | { readonly op: 'delete-workspace'; readonly id: string }

export type ProjectResponse =
  | { readonly ok: true; readonly view: ProjectRegistryView }
  | { readonly ok: false; readonly code: 'invalid' | 'not-a-folder' | 'workspace'; readonly message: string }

export class ProjectRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectRequestError'
  }
}

const MAX_ADOPTED = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function only(record: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(record).find(key => key !== 'op' && !allowed.includes(key))
  if (extra !== undefined) throw new ProjectRequestError(`unknown field "${extra}"`)
}

function pathOf(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 4096) throw new ProjectRequestError('path must be the absolute path of a folder')
  return value
}

/** @throws ProjectRequestError naming what is wrong; nothing is coerced. */
export function parseProjectRequest(value: unknown): ProjectRequest {
  if (!isRecord(value) || typeof value.op !== 'string') throw new ProjectRequestError('the request must be an object with an op')
  switch (value.op) {
    case 'add':
    case 'remove':
      only(value, ['path'])
      return { op: value.op, path: pathOf(value.path) }
    case 'adopt': {
      only(value, ['paths'])
      if (!Array.isArray(value.paths) || value.paths.length > MAX_ADOPTED) throw new ProjectRequestError(`paths must be a list of at most ${String(MAX_ADOPTED)} folders`)
      return { op: 'adopt', paths: value.paths.map(pathOf) }
    }
    case 'create-workspace': {
      only(value, ['name', 'kind', 'remote'])
      if (typeof value.kind !== 'string' || !(WORKSPACE_KINDS as readonly string[]).includes(value.kind)) throw new ProjectRequestError(`kind must be one of ${WORKSPACE_KINDS.join(', ')}`)
      const remote = value.remote === undefined ? undefined : remoteOf(value.remote)
      return { op: 'create-workspace', name: textOf(value.name, 'name'), kind: value.kind as WorkspaceKind, ...(remote === undefined ? {} : { remote }) }
    }
    case 'switch-workspace':
    case 'delete-workspace':
      only(value, ['id'])
      return { op: value.op, id: textOf(value.id, 'id') }
    case 'rename-workspace':
      only(value, ['id', 'name'])
      return { op: 'rename-workspace', id: textOf(value.id, 'id'), name: textOf(value.name, 'name') }
    default:
      throw new ProjectRequestError(`unknown op "${value.op}"`)
  }
}

function textOf(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 200) throw new ProjectRequestError(`${field} must be a short text`)
  return value
}

function remoteOf(value: unknown): { host: string, user?: string, path?: string } {
  if (!isRecord(value)) throw new ProjectRequestError('remote must be an object with a host')
  const extra = Object.keys(value).find(key => !['host', 'user', 'path'].includes(key))
  if (extra !== undefined) throw new ProjectRequestError(`unknown remote field "${extra}"`)
  return {
    host: textOf(value.host, 'remote.host'),
    ...(value.user === undefined ? {} : { user: textOf(value.user, 'remote.user') }),
    ...(value.path === undefined ? {} : { path: textOf(value.path, 'remote.path') }),
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function workspaceOf(value: unknown): WorkspaceSummary {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !(WORKSPACE_KINDS as readonly unknown[]).includes(value.kind) || !isStringList(value.projects)) {
    throw new ProjectRequestError('the registry view is malformed')
  }
  const remote = value.remote === undefined ? undefined : remoteOf(value.remote)
  return { id: value.id, name: value.name, kind: value.kind as WorkspaceKind, projects: value.projects, ...(remote === undefined ? {} : { remote }) }
}

export function parseProjectRegistryView(value: unknown): ProjectRegistryView {
  if (!isRecord(value) || !isStringList(value.paths) || typeof value.adopted !== 'boolean' || !Array.isArray(value.workspaces) || typeof value.current !== 'string') {
    throw new ProjectRequestError('the registry view is malformed')
  }
  return { paths: value.paths, adopted: value.adopted, workspaces: value.workspaces.map(workspaceOf), current: value.current }
}
