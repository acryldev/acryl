/**
 * What changes on screen when the shown workspace does (spec 043), whoever changed it: a click on the strip, a new workspace, an agent's
 * `acryl_workspace_switch`, another window. The tab sets become the workspace's own; the selected worktree stays when it belongs to one
 * of the workspace's projects, else the workspace's first project is shown with its chat, and a workspace without projects shows none.
 */

import type { WorkspaceGroups } from '../canvas/groups.ts'
import type { RepoState, WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { ProjectRegistryState } from './registry-state.ts'

export interface ShownWorkspaceDeps {
  readonly registry: Pick<ProjectRegistryState, 'current' | 'paths' | 'subscribe'>
  readonly groups: Pick<WorkspaceGroups, 'setWorkspace'>
  readonly shell: Pick<WorkspaceShellState, 'getSnapshot' | 'clearSelection'>
  /** Show a worktree and its chat, as picking it in the tree does. */
  readonly showWorktree: (path: string) => void
}

/** `path` is `folder` or below it, with either separator (Windows paths use backslashes). */
const inside = (path: string, folder: string): boolean => {
  if (path === folder) return true
  const base = folder.replace(/[\\/]+$/u, '')
  return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`)
}

/** Whether the worktree at `selected` belongs to one of `projects`: its repository, or a worktree of it, is inside one. */
export function belongsToProjects(selected: string, repos: readonly RepoState[], projects: readonly string[]): boolean {
  const repo = repos.find(candidate => candidate.worktrees.some(worktree => worktree.path === selected))
  const places = repo === undefined ? [selected] : [repo.root, ...repo.worktrees.map(worktree => worktree.path)]
  return places.some(place => projects.some(project => inside(place, project)))
}

/** @returns disposer, for one owning effect. */
export function followShownWorkspace(deps: ShownWorkspaceDeps): () => void {
  let shown = deps.registry.current()
  deps.groups.setWorkspace(shown)
  return deps.registry.subscribe(() => {
    const next = deps.registry.current()
    if (next === shown) return
    shown = next
    deps.groups.setWorkspace(next)
    const projects = deps.registry.paths()
    const snapshot = deps.shell.getSnapshot()
    const selected = snapshot.selectedPath
    if (selected !== undefined && belongsToProjects(selected, snapshot.repos, projects)) return
    const first = projects[0]
    if (first === undefined) deps.shell.clearSelection()
    else deps.showWorktree(first)
  })
}
