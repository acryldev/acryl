/**
 * The project registry's wire contract. A project is a folder the user added to ACRYL; ACRYL owns the list (it lives in the ACRYL home through
 * `acryl-settings`), and the DeepSeek Harness chat's workspaces follow it one way: a chat registers the folder it runs in when it starts, never the other
 * way round.
 */

export const WORKSPACE_PROJECTS_PATH = '/api/acryl-workspace/projects'

export interface ProjectRegistryView {
  /** Absolute folder paths, in the order the user added them. */
  readonly paths: readonly string[]
  /** The projects that already existed as DSH workspaces were taken over once (see `adopt`). */
  readonly adopted: boolean
}

export type ProjectRequest =
  | { readonly op: 'add'; readonly path: string }
  | { readonly op: 'remove'; readonly path: string }
  /** Take over folders that were registered before ACRYL owned the list. Applied once; later calls change nothing. */
  | { readonly op: 'adopt'; readonly paths: readonly string[] }

export type ProjectResponse =
  | { readonly ok: true; readonly view: ProjectRegistryView }
  | { readonly ok: false; readonly code: 'invalid' | 'not-a-folder'; readonly message: string }

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
    default:
      throw new ProjectRequestError(`unknown op "${value.op}"`)
  }
}

export function parseProjectRegistryView(value: unknown): ProjectRegistryView {
  if (!isRecord(value) || !Array.isArray(value.paths) || value.paths.some(path => typeof path !== 'string') || typeof value.adopted !== 'boolean') {
    throw new ProjectRequestError('the registry view is malformed')
  }
  return { paths: value.paths as string[], adopted: value.adopted }
}
