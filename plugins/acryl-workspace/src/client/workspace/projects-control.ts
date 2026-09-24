/**
 * Actions behind the Projects tab: add a git project, and show the chat that belongs to a worktree.
 * Every dependency is injected so the flows are testable without a browser or a Host.
 */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceGitApi } from './git-api.ts'
import { pickSession, type SessionRef } from './session-pick.ts'
import type { WorkspaceShellState } from './shell-state.ts'

export type ProjectAction = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface ProjectsControl {
  /** Change-detection key for the registered workspace folders (a primitive, safe to subscribe to). */
  workspaceKey(): string
  /** Registered workspace folders, so a project appears even before it has a chat. */
  workspacePaths(): readonly string[]
  subscribeWorkspaces(listener: () => void): () => void
  /** Pick a folder, require a git repository, register it as a workspace and open a chat in it. */
  addProject(): Promise<ProjectAction>
  /** Show the chat for a worktree: its latest one, or a new one started there. */
  showChat(worktreePath: string): Promise<ProjectAction>
  /** Start an additional chat in a worktree that may already have some. */
  newChat(worktreePath: string): Promise<ProjectAction>
  /** Create a branch and worktree in a repository, select it and open a chat there. */
  newWorktree(repoRoot: string, branch: string): Promise<ProjectAction>
  /** Open the app's Settings dialog. */
  openSettings(): ProjectAction
}

export interface ProjectsControlDeps {
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
  readonly getWorkspaces: () => IWorkspaces | undefined
  readonly getSessions: () => ISessions | undefined
  /** Looked up when needed, because the desktop installs its folder-picker seam after this plugin loads. */
  readonly directory: () => DirectorySeams
}

export interface DirectorySeams {
  /** Open the platform folder chooser; null when the user cancels. Undefined outside the desktop app. */
  readonly pickDirectory: (() => Promise<string | null>) | undefined
  /** Ask the desktop whether a folder is safe to persist as a workspace. */
  readonly validateDirectory?: ((path: string) => Promise<boolean>) | undefined
}

function fail(reason: string): ProjectAction {
  return { ok: false, reason }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function createProjectsControl(deps: ProjectsControlDeps): ProjectsControl {
  const { shell } = deps

  const workspaceItems = () => deps.getWorkspaces()?.list.getSnapshot().items ?? []

  return {
    workspaceKey: () => workspaceItems().map(item => item.path).join('\n'),
    workspacePaths: () => workspaceItems().map(item => item.path),
    subscribeWorkspaces: listener => deps.getWorkspaces()?.list.subscribe(listener) ?? (() => {}),

    async addProject() {
      const seams = deps.directory()
      if (seams.pickDirectory === undefined) return fail('Adding a project needs the desktop app\'s folder picker.')
      const workspaces = deps.getWorkspaces()
      if (workspaces === undefined) return fail('Workspaces are not available yet.')
      let picked: string | null
      try {
        picked = await seams.pickDirectory()
      } catch (cause) {
        return fail(message(cause))
      }
      if (picked === null) return { ok: true }

      // A project is a git repository: check before registering anything.
      const worktree = await shell.discover(picked)
      if (worktree === undefined) return fail('That folder is not a git repository.')
      if (seams.validateDirectory !== undefined) {
        try {
          if (!(await seams.validateDirectory(worktree))) return fail('That folder cannot be added as a project.')
        } catch (cause) {
          return fail(message(cause))
        }
      }
      if (!workspaceItems().some(item => item.path === worktree)) {
        try {
          await workspaces.create({ path: worktree })
        } catch (cause) {
          return fail(`Could not add the project: ${message(cause)}`)
        }
      }
      shell.select(worktree)
      const shown = await this.showChat(worktree)
      if (!shown.ok) shell.unpin()
      return shown
    },

    async showChat(worktreePath) {
      const sessions = deps.getSessions()
      if (sessions === undefined) return fail('Chats are not available yet.')
      const state = sessions.list.getSnapshot()
      // An empty chat that belongs to no workspace is the kind that asks "Choose workspace" and cannot
      // start; reusing one would bring that prompt back, so only bound or non-empty chats are candidates.
      const bound = new Set<string>(workspaceItems().flatMap(item => item.sessionIds))
      const refs: SessionRef[] = []
      for (const id of state.ids) {
        const row = state.byId[id]
        if (row === undefined || (row.blank && !bound.has(id))) continue
        refs.push({ id, blank: row.blank, updatedAt: row.updatedAt, ...(row.cwd === undefined ? {} : { cwd: row.cwd }) })
      }
      const existing = pickSession(shell.getSnapshot().repos, refs, worktreePath)
      if (existing === undefined) return this.newChat(worktreePath)
      const id = state.ids.find(candidate => candidate === existing)
      if (id === undefined) return fail('That chat is no longer available.')
      try {
        sessions.open(id)
        return { ok: true }
      } catch (cause) {
        shell.unpin()
        return fail(`Could not open a chat for this branch: ${message(cause)}`)
      }
    },

    async newChat(worktreePath) {
      const sessions = deps.getSessions()
      const workspaces = deps.getWorkspaces()
      if (sessions === undefined || workspaces === undefined) return fail('Chats are not available yet.')
      try {
        // A chat belongs to a workspace, and its directory is the workspace's. Without one the chat
        // opens unbound and asks the user to choose (and choosing the repository moves it to main).
        // So each worktree is registered as its own workspace the first time it gets a chat.
        let workspaceId = workspaceItems().find(item => item.path === worktreePath)?.workspaceId
        if (workspaceId === undefined) workspaceId = (await workspaces.create({ path: worktreePath })).workspaceId
        const created = await sessions.create({ cwd: worktreePath, workspaceId })
        sessions.open(created)
        return { ok: true }
      } catch (cause) {
        shell.unpin()
        return fail(`Could not open a chat for this branch: ${message(cause)}`)
      }
    },

    async newWorktree(repoRoot, branch) {
      let created
      try {
        created = await deps.gitApi.createWorktree(repoRoot, branch)
      } catch (cause) {
        return fail(message(cause))
      }
      shell.applyRepo(created.repo)
      shell.select(created.path)
      const shown = await this.newChat(created.path)
      if (!shown.ok) shell.unpin()
      return shown
    },

    openSettings() {
      // Settings keeps its open state inside a component, with no service to call. As the Cmd+, shortcut
      // does (see acryl-shortcuts), activate its real trigger: the one dialog button with no aria-label.
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"][aria-expanded]:not([aria-label])')
      if (trigger === null) return fail('Settings is not available in this window.')
      trigger.click()
      return { ok: true }
    },
  }
}

/** The desktop's folder chooser and path check, exposed on `window` for exactly this kind of caller. */
interface DesktopDirectoryWindow {
  __DSH_DESKTOP_PICK_DIRECTORY__?: () => Promise<string | null>
  __DSH_DESKTOP_VALIDATE_DIRECTORY__?: (path: string) => Promise<boolean>
}

/**
 * The desktop Host's native folder chooser, called directly. It is registered on every platform
 * (see `directory-picker-contract.ts` in acryl-desktop, which owns this path); the window seam above
 * is only published on Windows, so relying on it alone left macOS with no way to add a project.
 */
export const PICK_DIRECTORY_ROUTE = '/_dsh/desktop/pick-directory'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** @returns the chosen absolute path, or null when the user cancelled. */
export async function pickDirectoryViaHost(fetchImpl: FetchLike = (input, init) => fetch(input, init)): Promise<string | null> {
  const response = await fetchImpl(PICK_DIRECTORY_ROUTE, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error('ACRYL could not open the system folder picker')
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || !('path' in body) || (body.path !== null && typeof body.path !== 'string')) {
    throw new Error('ACRYL received an invalid response from the system folder picker')
  }
  return body.path
}

export function desktopDirectorySeams(
  view: DesktopDirectoryWindow = window as Window & DesktopDirectoryWindow,
  fetchImpl?: FetchLike,
): DirectorySeams {
  const seam = view.__DSH_DESKTOP_PICK_DIRECTORY__
  const validate = view.__DSH_DESKTOP_VALIDATE_DIRECTORY__
  return {
    pickDirectory: seam === undefined ? () => pickDirectoryViaHost(fetchImpl) : () => seam(),
    validateDirectory: validate === undefined ? undefined : path => validate(path),
  }
}
