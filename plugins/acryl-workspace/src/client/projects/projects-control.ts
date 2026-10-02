/**
 * Actions behind the Projects tab: add a git project, and show the chat that belongs to a worktree.
 * Every dependency is injected so the flows are testable without a browser or a Host.
 */

import type { ShellPlatform } from 'acryl-app-shell/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceGitApi } from '../git/git-api.ts'
import { pickSession, type SessionRef } from '../sessions/session-pick.ts'
import { owningWorktree } from './sidebar-model.ts'
import { FolderChooserUnavailableError } from './web-folder-picker.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { openMainSession } from '../sessions/main-session.ts'
import { findSettingsTrigger } from '../settings/open-settings.ts'

export type ProjectAction =
  | { readonly ok: true; /** A hint to show the user, when the action continues elsewhere. */ readonly note?: string }
  | { readonly ok: false; readonly reason: string; /** The caller should offer typing the folder's path instead (no chooser here). */ readonly needsPath?: true }

export interface ProjectsControl {
  /** Change-detection key for the registered workspace folders (a primitive, safe to subscribe to). */
  workspaceKey(): string
  /** Registered workspace folders, so a project appears even before it has a chat. */
  workspacePaths(): readonly string[]
  subscribeWorkspaces(listener: () => void): () => void
  /**
   * How a folder is chosen here: the window's own native picker (desktop) or the Host's (everywhere
   * else - Web, and desktop Linux where Electron has no picker seam of its own, T143), or by typing the
   * folder's path when neither is available.
   */
  chooserKind(): FolderChooserKind
  /** Choose a folder (by the picker or the upstream flow), require a git repository, register it and open a chat in it. */
  addProject(): Promise<ProjectAction>
  /** The same, for a folder path the user typed; the Host checks it is a real git worktree. */
  addProjectByPath(path: string): Promise<ProjectAction>
  /** Show the chat for a worktree: its latest one, or a new one started there. */
  showChat(worktreePath: string): Promise<ProjectAction>
  /** Start an additional chat in a worktree that may already have some. */
  newChat(worktreePath: string): Promise<ProjectAction>
  /**
   * Open one specific chat session by id (the workspace tree's expanded session list, spec 040 T129). An
   * empty chat that belongs to no Host workspace cannot be sent from ("Choose workspace" - and the folder
   * it sits under in the tree may not even be a registered workspace to choose), so opening one from a
   * worktree row starts a chat bound to that worktree instead (registering the workspace when needed),
   * carrying the old chat's name over and retiring the empty one from the tree.
   */
  openChat(id: string): Promise<ProjectAction>
  /**
   * Rename one chat session's durable title (owner request: rename from the left tree or the tab strip,
   * reflected in both). Goes through the per-session face's own `rename` - the top-level sessions
   * service has none - reached the way `agent-bridge.ts` already does: `scope(id)` then `sessionOf`.
   * The list row's `displayTitle` and any open chat tab follow from the resulting title projection.
   */
  renameChat(id: string, title: string): Promise<ProjectAction>
  /** Create a branch and worktree in a repository, select it and open a chat there. */
  newWorktree(repoRoot: string, branch: string): Promise<ProjectAction>
  /**
   * Remove a workspace from the tree entirely (owner request, T135-followup: "i can't remove added
   * workspace... I must be able to remove both workspace and sessions"). Deletes the real Host
   * registration when one exists (`IWorkspaces.delete` - "without deleting Sessions or files", so this
   * is a registration removal, never data loss); either way, also drops it from the shell's own repo
   * list so it does not linger client-side, and lets a later session still rediscover the same path.
   */
  removeWorkspace(root: string): Promise<ProjectAction>
  /** Open the app's Settings dialog. */
  openSettings(): ProjectAction
}

export type FolderChooserKind = 'picker' | 'path'

export interface ProjectsControlDeps {
  /** Which surface this page is. */
  readonly platform: ShellPlatform
  readonly shell: WorkspaceShellState
  readonly gitApi: WorkspaceGitApi
  readonly getWorkspaces: () => IWorkspaces | undefined
  readonly getSessions: () => ISessions | undefined
  /** Looked up when needed, because the desktop installs its folder-picker seam after this plugin loads. */
  readonly directory: () => DirectorySeams
  /** Opens the OS folder chooser on the machine running the Host (see `web-folder-picker.ts`): the only
   * chooser on Web, and desktop Linux's fallback once Electron's own seam (`directory().pickDirectory`)
   * is absent - both are served by the same Host route (T143), so neither platform needs anything else. */
  readonly webPickDirectory?: () => Promise<string | null>
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

/** "project: branch", so a branch's workspace reads as part of its project in the workspace list. */
function worktreeTitle(shell: WorkspaceShellState, worktreePath: string): string | undefined {
  for (const repo of shell.getSnapshot().repos) {
    const worktree = repo.worktrees.find(entry => entry.path === worktreePath)
    if (worktree === undefined) continue
    return worktree.main || worktree.branch === null ? undefined : `${repo.name}: ${worktree.branch}`
  }
  return undefined
}

function folderName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

function message(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  // A RemoteFailure (a `RemoteResult` error branch) is a plain object with a message, not an Error.
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string') return cause.message
  return String(cause)
}

export function createProjectsControl(deps: ProjectsControlDeps): ProjectsControl {
  const { shell } = deps

  const workspaceItems = () => deps.getWorkspaces()?.list.getSnapshot().items ?? []

  /** The chooser to use: the window's own native seam (desktop with one), else the Host's (T143) - until
   * it says it has none. */
  let webPickerUnavailable = false
  const nativePicker = (): (() => Promise<string | null>) | undefined => {
    const seam = deps.directory().pickDirectory
    if (seam !== undefined) return seam
    return webPickerUnavailable ? undefined : deps.webPickDirectory
  }

  /**
   * Create a chat bound to a worktree's workspace. In this app a chat runs in exactly its workspace's
   * folder, and the Host rejects a request that names both a workspace and a directory. An unbound chat
   * cannot be sent ("Choose workspace"), and choosing the repository would move it to main. So a worktree,
   * being a different folder, is registered as a workspace the first time it gets a chat, named after its
   * project and branch.
   */
  const startBoundChat = async (worktreePath: string): Promise<{ readonly ok: true; readonly id: SessionId } | { readonly ok: false; readonly reason: string }> => {
    const sessions = deps.getSessions()
    const workspaces = deps.getWorkspaces()
    if (sessions === undefined || workspaces === undefined) return { ok: false, reason: 'Chats are not available yet.' }
    try {
      const existing = workspaceItems().find(item => item.path === worktreePath)
      let workspaceId = existing?.workspaceId
      if (existing !== undefined && existing.title === folderName(worktreePath)) {
        // Registered earlier under its bare folder name: give it the project-and-branch name too.
        const title = worktreeTitle(shell, worktreePath)
        if (title !== undefined) await workspaces.rename(existing.workspaceId, title).catch(() => undefined)
      }
      if (workspaceId === undefined) {
        const view = await workspaces.create({ path: worktreePath })
        workspaceId = view.workspaceId
        const title = worktreeTitle(shell, worktreePath)
        if (title !== undefined) await workspaces.rename(workspaceId, title).catch(() => undefined)
      }
      return { ok: true, id: await sessions.create({ workspaceId }) }
    } catch (cause) {
      return { ok: false, reason: `Could not open a chat for this branch: ${message(cause)}` }
    }
  }

  return {
    workspaceKey: () => workspaceItems().map(item => item.path).join('\n'),
    workspacePaths: () => workspaceItems().map(item => item.path),
    subscribeWorkspaces: listener => deps.getWorkspaces()?.list.subscribe(listener) ?? (() => {}),

    chooserKind() {
      return nativePicker() !== undefined ? 'picker' : 'path'
    },

    async addProject() {
      const pick = nativePicker()
      if (pick === undefined) return { ok: false, reason: 'Type the path of a git repository folder to add it.', needsPath: true }
      let picked: string | null
      try {
        picked = await pick()
      } catch (cause) {
        if (cause instanceof FolderChooserUnavailableError) {
          webPickerUnavailable = true // remembered: the next "+" goes straight to typing
          return { ok: false, reason: 'This machine has no folder chooser - type the folder path instead.', needsPath: true }
        }
        return fail(message(cause))
      }
      if (picked === null) return { ok: true }
      return this.addProjectByPath(picked)
    },

    async addProjectByPath(path) {
      const seams = deps.directory()
      const workspaces = deps.getWorkspaces()
      if (workspaces === undefined) return fail('Workspaces are not available yet.')
      const typed = path.trim()
      if (typed === '') return fail('Type the path of a folder to add.')
      // A project is a git repository or a plain folder (T135: "should be able to handle both git /
      // non-git"). registerFolder: true - this is the one explicit "add this folder" action, unlike the
      // passive per-session discovery that must never promote an untouched directory to a workspace.
      // clearForgotten: true - re-adding a folder the user previously removed (T137-followup) must
      // actually work, not silently no-op against its own earlier removal.
      const worktree = await shell.discover(typed, { registerFolder: true, clearForgotten: true })
      if (worktree === undefined) return fail('Could not add that folder.')
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

    async openChat(id) {
      const sessions = deps.getSessions()
      if (sessions === undefined) return fail('Chats are not available yet.')
      const state = sessions.list.getSnapshot()
      const branded = state.ids.find(candidate => candidate === id)
      if (branded === undefined) return fail('That chat is no longer available.')
      const row = state.byId[branded]
      const isBound = workspaceItems().some(item => item.sessionIds.includes(branded))
      const worktree = row !== undefined && row.blank && !isBound && row.cwd !== undefined
        ? owningWorktree(shell.getSnapshot().repos, row.cwd)
        : undefined
      if (worktree !== undefined) {
        const started = await startBoundChat(worktree)
        if (!started.ok) return fail(started.reason)
        openMainSession(sessions, started.id)
        // Same name, and the empty unbound one leaves the tree (it can never be sent from).
        if (row?.title !== undefined && row.title.trim() !== '') await this.renameChat(started.id, row.title) // best effort: a failed rename must not fail the open
        shell.dismissChat(branded)
        return { ok: true }
      }
      try {
        openMainSession(sessions, branded)
        return { ok: true }
      } catch (cause) {
        return fail(`Could not open that chat: ${message(cause)}`)
      }
    },

    async renameChat(id, raw) {
      const sessions = deps.getSessions()
      if (sessions === undefined) return fail('Chats are not available yet.')
      const title = raw.trim()
      if (title === '') return fail('A chat needs a name.')
      const branded = sessions.list.getSnapshot().ids.find(candidate => candidate === id)
      if (branded === undefined) return fail('That chat is no longer available.')
      const scope = sessions.scope(branded)
      const face = scope === undefined ? undefined : sessions.sessionOf(scope)
      if (face === undefined) return fail('That chat is not ready to be renamed.')
      try {
        const result = await face.rename(title)
        return result.ok ? { ok: true } : fail(`Could not rename that chat: ${message(result.error)}`)
      } catch (cause) {
        return fail(`Could not rename that chat: ${message(cause)}`)
      }
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
        openMainSession(sessions, id)
        return { ok: true }
      } catch (cause) {
        shell.unpin()
        return fail(`Could not open a chat for this branch: ${message(cause)}`)
      }
    },

    async newChat(worktreePath) {
      const started = await startBoundChat(worktreePath)
      if (!started.ok) { shell.unpin(); return fail(started.reason) }
      const sessionsService = deps.getSessions()
      if (sessionsService !== undefined) openMainSession(sessionsService, started.id)
      return { ok: true }
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

    async removeWorkspace(root) {
      const workspaces = deps.getWorkspaces()
      const existing = workspaceItems().find(item => item.path === root)
      if (existing !== undefined && workspaces !== undefined) {
        try {
          await workspaces.delete(existing.workspaceId)
        } catch (cause) {
          return fail(`Could not remove that workspace: ${message(cause)}`)
        }
      }
      shell.forgetRepo(root)
      return { ok: true }
    },

    openSettings() {
      // Settings keeps its open state inside a component, with no service to call. As the Cmd+, shortcut
      // does (see acryl-shortcuts), activate its real trigger: the one dialog button with no aria-label.
      const trigger = findSettingsTrigger(document)
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

export function desktopDirectorySeams(view: DesktopDirectoryWindow = window as Window & DesktopDirectoryWindow): DirectorySeams {
  const seam = view.__DSH_DESKTOP_PICK_DIRECTORY__
  const validate = view.__DSH_DESKTOP_VALIDATE_DIRECTORY__
  return {
    pickDirectory: seam === undefined ? undefined : () => seam(),
    validateDirectory: validate === undefined ? undefined : path => validate(path),
  }
}
