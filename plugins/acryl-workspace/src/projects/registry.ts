/**
 * The project registry: the folders the user added, grouped into workspaces (spec 043), in one `acryl-settings` section, changed one write at a time.
 * A workspace is a named set of projects the sidebar shows as a whole; Default always exists and starts with every project added before workspaces
 * existed. A project can be in several workspaces; removing it from one never touches the others or the disk.
 */

import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { SettingsScope } from 'acryl-settings'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_WORKSPACE_ID, type ProjectRegistryView, type WorkspaceKind, type WorkspaceSummary } from './contract.ts'

export const PROJECTS_NAMESPACE = 'workspace'

export { DEFAULT_WORKSPACE_ID }

export interface RemoteTarget {
  host: string
  user?: string
  path?: string
}

export interface WorkspaceRecord {
  id: string
  name: string
  kind: WorkspaceKind
  projects: string[]
  remote?: RemoteTarget
}

export interface ProjectsSection {
  /** The folders added before workspaces existed: read once to build Default, then left empty. */
  projects: string[]
  adopted: boolean
  workspaces: WorkspaceRecord[]
  current: string
}

const WorkspaceSchema: z<WorkspaceRecord> = z.object({
  id: z.string().required(),
  name: z.string().required(),
  kind: z.union(['individual', 'shared', 'remote']).default('individual'),
  projects: z.array(z.string()).default([]),
  // Validated in code (validRemote) where it applies: a schema-required host would also be demanded of workspaces that have no remote.
  remote: z.object({ host: z.string(), user: z.string(), path: z.string() }),
})

/** The section's schema: the workspaces with their folders, the one shown, and whether the pre-existing folders were taken over. */
export const ProjectsSchema: z<ProjectsSection> = z.object({
  projects: z.array(z.string()).default([]).description('Folders added before workspaces existed; moved into the Default workspace.'),
  adopted: z.boolean().default(false).description('Projects registered before ACRYL owned the list were taken over once.'),
  workspaces: z.array(WorkspaceSchema).default([]).description('Workspaces: named sets of projects, Default first.'),
  current: z.string().default(DEFAULT_WORKSPACE_ID).description('The workspace the sidebar shows.'),
})

/** A request the registry refuses (an unknown workspace, a duplicate name, deleting Default). */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

const MAX_NAME_LENGTH = 60

export class ProjectFolderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFolderError'
  }
}

/** The canonical form of a project folder: absolute, no trailing separator. @throws ProjectFolderError for anything that is not an existing folder. */
export function normalizeProjectFolder(path: string): string {
  if (!isAbsolute(path)) throw new ProjectFolderError(`${path} is not an absolute path`)
  const folder = resolve(path)
  let stat
  try {
    stat = statSync(folder)
  } catch {
    throw new ProjectFolderError(`${folder} does not exist`)
  }
  if (!stat.isDirectory()) throw new ProjectFolderError(`${folder} is not a folder`)
  return folder
}

export class ProjectRegistry {
  private readonly listeners = new Set<(view: ProjectRegistryView) => void>()

  constructor(private readonly scope: SettingsScope<ProjectsSection>) {}

  /** Observe every saved change, whoever made it (a page, an agent's tool). @returns disposer. */
  onChange(listener: (view: ProjectRegistryView) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  view(): ProjectRegistryView {
    const section = this.scope.get()
    const workspaces = this.workspaces()
    const current = this.current(workspaces)
    return {
      paths: [...current.projects],
      adopted: section.adopted,
      workspaces: workspaces.map(summary),
      current: current.id,
    }
  }

  /** Add a folder to the workspace shown. */
  async add(path: string): Promise<ProjectRegistryView> {
    const folder = normalizeProjectFolder(path)
    const workspaces = this.workspaces()
    const current = this.current(workspaces)
    if (current.projects.includes(folder)) return this.view()
    return this.save(workspaces.map(workspace => (workspace.id === current.id ? { ...workspace, projects: [...workspace.projects, folder] } : workspace)), current.id)
  }

  /** Remove a folder from the workspace shown. Removing a folder that is not listed is not an error: the list is what the caller wanted. */
  async remove(path: string): Promise<ProjectRegistryView> {
    const folder = resolve(path)
    const workspaces = this.workspaces()
    const current = this.current(workspaces)
    if (!current.projects.includes(folder)) return this.view()
    return this.save(workspaces.map(workspace => (workspace.id === current.id ? { ...workspace, projects: workspace.projects.filter(candidate => candidate !== folder) } : workspace)), current.id)
  }

  /** Take over folders registered elsewhere, once, into Default. Folders that no longer exist are skipped, not fatal. */
  async adopt(paths: readonly string[]): Promise<ProjectRegistryView> {
    if (this.scope.get().adopted) return this.view()
    const workspaces = this.workspaces()
    const merged = [...this.defaultOf(workspaces).projects]
    for (const path of paths) {
      try {
        const folder = normalizeProjectFolder(path)
        if (!merged.includes(folder)) merged.push(folder)
      } catch {
        // A project that has since been deleted is not carried over.
      }
    }
    return this.save(workspaces.map(workspace => (workspace.id === DEFAULT_WORKSPACE_ID ? { ...workspace, projects: merged } : workspace)), this.current(workspaces).id, true)
  }

  /** Create a workspace and show it. @throws WorkspaceError for an empty or taken name, or a remote one without a host. */
  async createWorkspace(input: { readonly name: string, readonly kind: WorkspaceKind, readonly remote?: RemoteTarget }): Promise<ProjectRegistryView> {
    const workspaces = this.workspaces()
    const name = this.validName(input.name, workspaces)
    const remote = input.kind === 'remote' ? validRemote(input.remote) : undefined
    const record: WorkspaceRecord = { id: `ws-${randomUUID().slice(0, 8)}`, name, kind: input.kind, projects: [], ...(remote === undefined ? {} : { remote }) }
    return this.save([...workspaces, record], record.id)
  }

  /** Show another workspace. */
  async switchWorkspace(id: string): Promise<ProjectRegistryView> {
    const workspaces = this.workspaces()
    this.find(workspaces, id)
    return this.save(workspaces, id)
  }

  async renameWorkspace(id: string, name: string): Promise<ProjectRegistryView> {
    const workspaces = this.workspaces()
    this.find(workspaces, id)
    const valid = this.validName(name, workspaces.filter(workspace => workspace.id !== id))
    return this.save(workspaces.map(workspace => (workspace.id === id ? { ...workspace, name: valid } : workspace)), this.current(workspaces).id)
  }

  /** Delete a workspace (never Default). Its projects stay in other workspaces and on disk; the sidebar shows Default if it was shown. */
  async deleteWorkspace(id: string): Promise<ProjectRegistryView> {
    if (id === DEFAULT_WORKSPACE_ID) throw new WorkspaceError('The Default workspace cannot be deleted.')
    const workspaces = this.workspaces()
    this.find(workspaces, id)
    const current = this.current(workspaces).id
    return this.save(workspaces.filter(workspace => workspace.id !== id), current === id ? DEFAULT_WORKSPACE_ID : current)
  }

  /** The workspaces, Default first; before the first workspace write, Default is built from the pre-workspace folder list. */
  private workspaces(): WorkspaceRecord[] {
    const section = this.scope.get()
    const stored = section.workspaces.map(({ remote, ...workspace }): WorkspaceRecord => ({
      ...workspace,
      projects: [...workspace.projects],
      ...(workspace.kind === 'remote' && remote !== undefined && typeof remote.host === 'string' && remote.host !== '' ? { remote } : {}),
    }))
    if (stored.some(workspace => workspace.id === DEFAULT_WORKSPACE_ID)) return stored
    return [{ id: DEFAULT_WORKSPACE_ID, name: 'Default', kind: 'individual', projects: [...section.projects] }, ...stored]
  }

  private current(workspaces: readonly WorkspaceRecord[]): WorkspaceRecord {
    const id = this.scope.get().current
    return workspaces.find(workspace => workspace.id === id) ?? this.defaultOf(workspaces)
  }

  private defaultOf(workspaces: readonly WorkspaceRecord[]): WorkspaceRecord {
    const found = workspaces.find(workspace => workspace.id === DEFAULT_WORKSPACE_ID)
    if (found === undefined) throw new WorkspaceError('The Default workspace is missing.')
    return found
  }

  private find(workspaces: readonly WorkspaceRecord[], id: string): WorkspaceRecord {
    const found = workspaces.find(workspace => workspace.id === id)
    if (found === undefined) throw new WorkspaceError(`There is no workspace "${id}".`)
    return found
  }

  private validName(raw: string, others: readonly WorkspaceRecord[]): string {
    const name = raw.trim()
    if (name === '') throw new WorkspaceError('A workspace needs a name.')
    if (name.length > MAX_NAME_LENGTH) throw new WorkspaceError(`A workspace name has at most ${String(MAX_NAME_LENGTH)} characters.`)
    if (others.some(workspace => workspace.name.toLowerCase() === name.toLowerCase())) throw new WorkspaceError(`There is already a workspace called "${name}".`)
    return name
  }

  /** One write: the workspaces become the only list (the pre-workspace one is emptied, its folders now in Default). */
  private async save(workspaces: readonly WorkspaceRecord[], current: string, adopted?: boolean): Promise<ProjectRegistryView> {
    await this.scope.update({ workspaces: [...workspaces], current, projects: [], ...(adopted === undefined ? {} : { adopted }) })
    const view = this.view()
    for (const listener of [...this.listeners]) listener(view)
    return view
  }
}

function summary(workspace: WorkspaceRecord): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind,
    projects: [...workspace.projects],
    ...(workspace.remote === undefined ? {} : { remote: { ...workspace.remote } }),
  }
}

function validRemote(remote: RemoteTarget | undefined): RemoteTarget {
  const host = remote?.host.trim() ?? ''
  if (host === '') throw new WorkspaceError('A remote workspace needs the SSH host.')
  const user = remote?.user?.trim()
  const path = remote?.path?.trim()
  return { host, ...(user === undefined || user === '' ? {} : { user }), ...(path === undefined || path === '' ? {} : { path }) }
}
