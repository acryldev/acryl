/**
 * Observable state for the Workspace's left and right panes: which repositories and worktrees are
 * known, their changed files, and which worktree is selected. Pure TypeScript with an injected git
 * API, so it is unit-testable without a browser.
 */

import type { GitChange, GitRepoView } from '../../git/contract.ts'
import type { WorkspaceGitApi } from '../git/git-api.ts'

export type ShellMode = 'chats' | 'projects'
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface WorktreeState {
  readonly path: string
  readonly branch: string | null
  readonly main: boolean
  readonly phase: LoadPhase
  readonly changes: readonly GitChange[]
  /** Sum of added lines across changes that report counts. */
  readonly added: number
  /** Sum of removed lines across changes that report counts. */
  readonly removed: number
  readonly truncated: boolean
  readonly error?: string
}

export interface RepoState {
  readonly root: string
  readonly name: string
  /** false for a plain folder registered as a workspace that is not a git repository. It has exactly one synthetic worktree (itself), no
   * branches, and never polls git status - it always reports zero changes. */
  readonly git: boolean
  readonly worktrees: readonly WorktreeState[]
}

export interface ShellSnapshot {
  readonly mode: ShellMode
  readonly repos: readonly RepoState[]
  /** Worktree whose tab group and changes are shown. */
  readonly selectedPath: string | undefined
  /** Chat session ids the user closed from the tree or the tab strip; closing in one place hides the chat in both. This hides the session
   * from this view only: the injected `ISessions` face cannot delete a session, so the session itself is kept. */
  readonly dismissedChats: ReadonlySet<string>
}

/** A request to run one check (a package script) in a terminal tab of a worktree. */
export interface RunCheckRequest {
  readonly worktree: string
  /** Title for the terminal tab, for example `pnpm run check`. */
  readonly title: string
  /** The command line to type into the shell. Built from a validated script name only. */
  readonly commandLine: string
}

/** A request to open one file of a worktree in an editor tab. */
export interface OpenFileRequest {
  readonly worktree: string
  /** Path relative to the worktree. */
  readonly file: string
  /** The user asked for it beside the tab in front (a split); otherwise it opens as the current tab. */
  readonly beside?: boolean
}

/** A request to preview one markdown file of a worktree in a Doc tab. */
export type OpenDocRequest = OpenFileRequest

export interface OpenDiffRequest {
  readonly worktree: string
  readonly file: string
  /** The user asked for it beside the tab in front (a split); otherwise it opens as the current tab. */
  readonly beside?: boolean
}

/** A request to close one canvas tile (the tree's hover "x" on an agent or terminal entry). Handled by `routeShellRequests`, not
 * `WorkspaceState.closeTile` directly, so a terminal tile's process is released too - the tree has no access to that itself. */
export interface CloseTileRequest {
  readonly worktree: string
  readonly tileId: string
}

function sameChanges(a: readonly GitChange[], b: readonly GitChange[]): boolean {
  return a.length === b.length && a.every((change, index) => {
    const other = b[index]
    return other !== undefined
      && change.path === other.path && change.code === other.code && change.staged === other.staged
      && change.added === other.added && change.removed === other.removed && change.oldPath === other.oldPath
  })
}

/** Value equality for one worktree's state, so a refresh that learned nothing new emits nothing. */
function sameWorktree(a: WorktreeState, b: WorktreeState): boolean {
  return a.path === b.path && a.branch === b.branch && a.main === b.main && a.phase === b.phase
    && a.added === b.added && a.removed === b.removed && a.truncated === b.truncated && a.error === b.error
    && sameChanges(a.changes, b.changes)
}

function freshWorktree(path: string, branch: string | null, main: boolean): WorktreeState {
  return { path, branch, main, phase: 'idle', changes: [], added: 0, removed: 0, truncated: false }
}

function folderName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

export class WorkspaceShellState {
  private snapshot: ShellSnapshot = Object.freeze({
    mode: 'chats',
    repos: Object.freeze([]),
    selectedPath: undefined,
    dismissedChats: Object.freeze(new Set<string>()),
  })
  private readonly listeners = new Set<() => void>()
  private readonly diffListeners = new Set<(request: OpenDiffRequest) => void>()
  private readonly runListeners = new Set<(request: RunCheckRequest) => void>()
  private readonly fileListeners = new Set<(request: OpenFileRequest) => void>()
  private readonly docListeners = new Set<(request: OpenDocRequest) => void>()
  private readonly closeTileListeners = new Set<(request: CloseTileRequest) => void>()
  private readonly probes = new Map<string, Promise<string | undefined>>()
  /** Repos removed by `forgetRepo`. Passive discovery (every chat's folder, every registered workspace) would otherwise add a removed
   * repo straight back while a chat or the Host's list still points at it. Checked by `discover()` on every path; cleared only by an
   * explicit re-add (`clearForgotten: true`), never by passive discovery, whose sources can lag a delete. */
  private readonly forgottenRepos = new Set<string>()
  private readonly forgottenListeners = new Set<() => void>()
  private readonly statusInflight = new Map<string, Promise<void>>()
  private pinned = false
  private reveal: (() => void) | undefined
  private disposed = false

  /**
   * @param initialForgotten - a previous run's removed roots (`forgetRepo`), so a removal survives a reload.
   * @param initialDismissed - a previous run's dismissed chats (`dismissChat`), so a dismissal survives a reload.
   */
  constructor(private readonly api: WorkspaceGitApi, initialForgotten: readonly string[] = [], initialDismissed: readonly string[] = []) {
    for (const root of initialForgotten) this.forgottenRepos.add(root)
    if (initialDismissed.length > 0) this.snapshot = Object.freeze({ ...this.snapshot, dismissedChats: Object.freeze(new Set(initialDismissed)) })
  }

  getSnapshot(): ShellSnapshot {
    return this.snapshot
  }

  /** Repository roots currently removed (`forgetRepo`), for persistence. */
  forgottenRoots(): readonly string[] {
    return [...this.forgottenRepos]
  }

  /** Notified whenever the forgotten-roots set changes (a removal, or an explicit re-add lifting one). */
  onForgottenChange(listener: () => void): () => void {
    this.forgottenListeners.add(listener)
    return () => { this.forgottenListeners.delete(listener) }
  }

  private notifyForgottenChange(): void {
    for (const listener of this.forgottenListeners) listener()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The selected worktree, when it is known. */
  selectedWorktree(): WorktreeState | undefined {
    const path = this.snapshot.selectedPath
    if (path === undefined) return undefined
    for (const repo of this.snapshot.repos) {
      const found = repo.worktrees.find(worktree => worktree.path === path)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** Hide a chat from the tree and the tab strip. Idempotent. */
  dismissChat(id: string): void {
    if (this.snapshot.dismissedChats.has(id)) return
    this.replace({ ...this.snapshot, dismissedChats: Object.freeze(new Set([...this.snapshot.dismissedChats, id])) })
  }

  /** Undo a dismissal - a session explicitly reopened elsewhere (the classic "All chats" view, search) is
   * no longer hidden. A no-op when it was never dismissed. */
  restoreChat(id: string): void {
    if (!this.snapshot.dismissedChats.has(id)) return
    const next = new Set(this.snapshot.dismissedChats)
    next.delete(id)
    this.replace({ ...this.snapshot, dismissedChats: Object.freeze(next) })
  }

  /** Drop a repository or plain folder from the tree entirely, and remember it as removed: `discover()` refuses to merge a forgotten root
   * again (passive discovery would re-add it while a chat or the Host's list still points there); only an explicit re-add
   * (`clearForgotten: true`) lifts it. Its probe cache entries are cleared too, so a later fresh discovery does not reuse a stale result. */
  forgetRepo(root: string): void {
    if (!this.forgottenRepos.has(root)) {
      this.forgottenRepos.add(root)
      this.notifyForgottenChange()
    }
    if (!this.snapshot.repos.some(repo => repo.root === root)) return
    for (const key of [...this.probes.keys()]) {
      if (key === root || key.startsWith(root.endsWith('/') ? root : `${root}/`)) this.probes.delete(key)
    }
    const repos = this.snapshot.repos.filter(repo => repo.root !== root)
    const selectedGone = this.snapshot.selectedPath !== undefined
      && !repos.some(repo => repo.worktrees.some(worktree => worktree.path === this.snapshot.selectedPath))
    this.replace({
      ...this.snapshot,
      repos: Object.freeze(repos),
      selectedPath: selectedGone ? undefined : this.snapshot.selectedPath,
    })
  }

  setMode(mode: ShellMode): void {
    if (this.snapshot.mode === mode) return
    this.replace({ ...this.snapshot, mode })
  }

  /**
   * Learn about the repository that contains `cwd`.
   * @param options.registerFolder - when true, and `cwd` is not a git repository, register it as its own plain folder workspace instead
   * of reporting it unknown. Only for an explicit "add this folder" (`ProjectsControl.addProjectByPath`, and re-syncing already
   * registered project paths); never for passive discovery of a chat's folder, which would turn every folder a chat ran in into a
   * project. Bypasses the probe cache: an explicit add is not deduplicated against an earlier passive discovery of the same path.
   * @param options.clearForgotten - when true, lifts an earlier `forgetRepo(cwd)` for this exact path. Only for a deliberate re-add by the
   * user (`ProjectsControl.addProjectByPath`); never for re-syncing registered paths, whose source can still list a path for a moment
   * after it was removed.
   * @returns the path of the worktree (or plain folder) that owns `cwd` - undefined when `cwd` is not a
   * git repository and `registerFolder` was not requested, when the api call itself failed, or when the
   * owning root was explicitly removed (`forgetRepo`) and not since re-added.
   */
  discover(
    cwd: string,
    options: { readonly registerFolder?: boolean; readonly clearForgotten?: boolean } = {},
  ): Promise<string | undefined> {
    if (options.clearForgotten === true && this.forgottenRepos.delete(cwd)) this.notifyForgottenChange()
    if (options.registerFolder === true) {
      return this.api.repo(cwd).then((view) => {
        if (this.disposed) return undefined
        if (view === null) {
          if (this.forgottenRepos.has(cwd)) return undefined
          this.mergeFolder(cwd)
          return cwd
        }
        if (this.forgottenRepos.has(view.root)) return undefined
        this.mergeRepo(view)
        return view.current
      }, () => undefined)
    }
    const existing = this.probes.get(cwd)
    if (existing !== undefined) return existing
    const probe = this.api.repo(cwd).then((view) => {
      if (view === null || this.disposed) return undefined
      if (this.forgottenRepos.has(view.root)) return undefined
      this.mergeRepo(view)
      return view.current
    }, () => undefined)
    this.probes.set(cwd, probe)
    return probe
  }

  /** Take a repository view the caller already has (for example the answer to creating a worktree). */
  applyRepo(view: GitRepoView): void {
    if (!this.disposed) this.mergeRepo(view)
  }

  /**
   * Select the worktree that contains `cwd` unless the user has picked one by hand.
   * Used to follow the current chat session.
   */
  async follow(cwd: string): Promise<void> {
    const current = await this.discover(cwd)
    if (current === undefined || this.disposed) return
    // The chat switched to the worktree the user picked: the pick has taken effect, so from now on
    // the selection follows the chat again.
    if (this.pinned && current === this.snapshot.selectedPath) this.pinned = false
    if (this.pinned) return
    this.selectInternal(current)
  }

  /** Release a manual pick (for example when opening its chat failed) so the selection follows the chat again. */
  unpin(): void {
    this.pinned = false
  }

  /** The user picked a worktree: keep it selected even when the chat session changes, and reveal its changes. */
  select(path: string): void {
    this.pinned = true
    this.selectInternal(path)
    this.reveal?.()
  }

  /**
   * Select no worktree, and keep it so while the chat changes: a workspace without projects shows none (spec 043), even though the
   * chat on screen runs in a folder of another workspace.
   */
  clearSelection(): void {
    this.pinned = true
    if (this.snapshot.selectedPath === undefined) return
    this.replace({ ...this.snapshot, selectedPath: undefined })
  }

  /** Register (or clear) how to bring the Changes tab into view. Owned by the Changes tab plugin. */
  setReveal(reveal: (() => void) | undefined): void {
    this.reveal = reveal
  }

  /** Reload the worktree list of every known git repository and the status of every worktree. Never
   * polls a plain, non-git folder - it has no git state to refresh. */
  async refreshAll(): Promise<void> {
    const gitRepos = this.snapshot.repos.filter(repo => repo.git)
    await Promise.all(gitRepos.map(async (repo) => {
      const view = await this.api.repo(repo.root).catch(() => null)
      if (view !== null && !this.disposed) this.mergeRepo(view)
    }))
    for (const repo of gitRepos) {
      await Promise.all(repo.worktrees.map(worktree => this.refreshStatus(worktree.path)))
    }
  }

  /** Reload one worktree's changed files. Concurrent calls for the same path share one request. A no-op
   * for a plain, non-git folder - it always reports zero changes. */
  refreshStatus(path: string): Promise<void> {
    if (!this.isGitWorktree(path)) return Promise.resolve()
    const existing = this.statusInflight.get(path)
    if (existing !== undefined) return existing
    const known = this.findWorktree(path)
    if (known !== undefined && known.phase === 'idle') this.patchWorktree(path, { phase: 'loading' })
    const request = this.api.status(path).then((status) => {
      if (this.disposed) return
      let added = 0
      let removed = 0
      for (const change of status.changes) {
        added += change.added ?? 0
        removed += change.removed ?? 0
      }
      this.patchWorktree(path, {
        phase: 'ready',
        branch: status.branch,
        changes: status.changes,
        added,
        removed,
        truncated: status.truncated,
      })
    }, (cause: unknown) => {
      if (this.disposed) return
      this.patchWorktree(path, { phase: 'error', error: cause instanceof Error ? cause.message : String(cause) })
    }).finally(() => { this.statusInflight.delete(path) })
    this.statusInflight.set(path, request)
    return request
  }

  /** Ask the canvas to close a tile (the tree's hover "x" on an agent or terminal entry). */
  requestCloseTile(request: CloseTileRequest): void {
    for (const listener of this.closeTileListeners) listener(request)
  }

  /** @returns disposer. */
  onCloseTileRequest(listener: (request: CloseTileRequest) => void): () => void {
    this.closeTileListeners.add(listener)
    return () => { this.closeTileListeners.delete(listener) }
  }

  /** Ask the canvas to open (or focus) a diff tile for one changed file. */
  openDiff(request: OpenDiffRequest): void {
    for (const listener of this.diffListeners) listener(request)
  }

  /** @returns disposer. */
  onOpenDiff(listener: (request: OpenDiffRequest) => void): () => void {
    this.diffListeners.add(listener)
    return () => { this.diffListeners.delete(listener) }
  }

  /** Ask the canvas to open (or focus) an editor tab for one file. */
  openFile(request: OpenFileRequest): void {
    for (const listener of this.fileListeners) listener(request)
  }

  /** @returns disposer. */
  onOpenFile(listener: (request: OpenFileRequest) => void): () => void {
    this.fileListeners.add(listener)
    return () => { this.fileListeners.delete(listener) }
  }

  /** Ask the canvas to open (or focus) a read-only Doc tab for one markdown file. */
  openDoc(request: OpenDocRequest): void {
    for (const listener of this.docListeners) listener(request)
  }

  /** @returns disposer. */
  onOpenDoc(listener: (request: OpenDocRequest) => void): () => void {
    this.docListeners.add(listener)
    return () => { this.docListeners.delete(listener) }
  }

  /** Ask the canvas to run a check in a terminal tab of that worktree. */
  runCheck(request: RunCheckRequest): void {
    for (const listener of this.runListeners) listener(request)
  }

  /** @returns disposer. */
  onRunCheck(listener: (request: RunCheckRequest) => void): () => void {
    this.runListeners.add(listener)
    return () => { this.runListeners.delete(listener) }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.diffListeners.clear()
    this.runListeners.clear()
    this.fileListeners.clear()
    this.docListeners.clear()
    this.closeTileListeners.clear()
  }

  private selectInternal(path: string): void {
    if (this.snapshot.selectedPath === path) return
    this.replace({ ...this.snapshot, selectedPath: path })
    void this.refreshStatus(path)
  }

  private findWorktree(path: string): WorktreeState | undefined {
    for (const repo of this.snapshot.repos) {
      const found = repo.worktrees.find(worktree => worktree.path === path)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** false only for a path known to belong to a plain, non-git folder repo; true for everything else,
   * including a path not seen yet (the old, safe default: assume git until proven otherwise). */
  private isGitWorktree(path: string): boolean {
    for (const repo of this.snapshot.repos) {
      if (repo.worktrees.some(worktree => worktree.path === path)) return repo.git
    }
    return true
  }

  private mergeRepo(view: GitRepoView): void {
    const previous = this.snapshot.repos.find(repo => repo.root === view.root)
    const worktrees = view.worktrees.map((listed) => {
      const before = previous?.worktrees.find(worktree => worktree.path === listed.path)
      return before === undefined
        ? freshWorktree(listed.path, listed.branch, listed.main)
        : { ...before, branch: listed.branch, main: listed.main }
    })
    this.applyRepoState({ root: view.root, name: view.name, git: true, worktrees })
  }

  /** Register `cwd` itself as a plain, non-git folder workspace - one synthetic worktree, no branches,
   * never polled for git status. A no-op once `cwd` is already known (as a repo or as a folder). */
  private mergeFolder(cwd: string): void {
    if (this.snapshot.repos.some(repo => repo.root === cwd)) return
    this.applyRepoState({
      root: cwd,
      name: folderName(cwd),
      git: false,
      worktrees: [{ ...freshWorktree(cwd, null, true), phase: 'ready' }],
    })
  }

  private applyRepoState(next: RepoState): void {
    const previous = this.snapshot.repos.find(repo => repo.root === next.root)
    if (previous !== undefined && previous.name === next.name && previous.git === next.git
      && previous.worktrees.length === next.worktrees.length
      && previous.worktrees.every((before, index) => {
        const after = next.worktrees[index]
        return after !== undefined && sameWorktree(before, after)
      })) {
      return
    }
    const others = this.snapshot.repos.filter(repo => repo.root !== next.root)
    const repos = [...others, next].sort((a, b) => a.name.localeCompare(b.name))
    const selectedGone = this.snapshot.selectedPath !== undefined
      && previous !== undefined
      && !next.worktrees.some(worktree => worktree.path === this.snapshot.selectedPath)
      && previous.worktrees.some(worktree => worktree.path === this.snapshot.selectedPath)
    this.replace({
      ...this.snapshot,
      repos: Object.freeze(repos),
      selectedPath: selectedGone ? undefined : this.snapshot.selectedPath,
    })
    // A worktree seen for the first time gets its status now, so its dot does not sit on "loading"
    // until the next poll tick. Never for a non-git folder - it has no git status to poll for.
    if (!next.git) return
    for (const worktree of next.worktrees) {
      if (previous?.worktrees.some(before => before.path === worktree.path) !== true) {
        void this.refreshStatus(worktree.path)
      }
    }
  }

  private patchWorktree(path: string, patch: Partial<WorktreeState>): void {
    let changed = false
    const repos = this.snapshot.repos.map((repo) => {
      const index = repo.worktrees.findIndex(worktree => worktree.path === path)
      const before = repo.worktrees[index]
      if (before === undefined) return repo
      const after: WorktreeState = { ...before, ...patch }
      // A poll that returns what we already know must not notify: every notification re-renders the
      // canvas, and the chat inside it, for nothing.
      if (sameWorktree(before, after)) return repo
      changed = true
      return { ...repo, worktrees: repo.worktrees.map((worktree, position) => position === index ? after : worktree) }
    })
    if (changed) this.replace({ ...this.snapshot, repos: Object.freeze(repos) })
  }

  private replace(snapshot: ShellSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of [...this.listeners]) listener()
  }
}
