/**
 * Observable state for the Workspace's left and right panes: which repositories and worktrees are
 * known, their changed files, and which worktree is selected. Pure TypeScript with an injected git
 * API, so it is unit-testable without a browser.
 */

import type { GitChange, GitRepoView } from '../../workspace-git-contract.ts'
import type { WorkspaceGitApi } from './git-api.ts'

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
  readonly worktrees: readonly WorktreeState[]
}

export interface ShellSnapshot {
  readonly mode: ShellMode
  readonly repos: readonly RepoState[]
  /** Worktree whose tab group and changes are shown. */
  readonly selectedPath: string | undefined
}

export interface OpenDiffRequest {
  readonly worktree: string
  readonly file: string
}

function freshWorktree(path: string, branch: string | null, main: boolean): WorktreeState {
  return { path, branch, main, phase: 'idle', changes: [], added: 0, removed: 0, truncated: false }
}

export class WorkspaceShellState {
  private snapshot: ShellSnapshot = Object.freeze({ mode: 'chats', repos: Object.freeze([]), selectedPath: undefined })
  private readonly listeners = new Set<() => void>()
  private readonly diffListeners = new Set<(request: OpenDiffRequest) => void>()
  private readonly probes = new Map<string, Promise<string | undefined>>()
  private readonly statusInflight = new Map<string, Promise<void>>()
  private pinned = false
  private reveal: (() => void) | undefined
  private disposed = false

  constructor(private readonly api: WorkspaceGitApi) {}

  getSnapshot(): ShellSnapshot {
    return this.snapshot
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

  setMode(mode: ShellMode): void {
    if (this.snapshot.mode === mode) return
    this.replace({ ...this.snapshot, mode })
  }

  /**
   * Learn about the repository that contains `cwd`. Repeated calls for one directory share one probe.
   * @returns the path of the worktree containing `cwd`, or undefined when it is not in a git repository.
   */
  discover(cwd: string): Promise<string | undefined> {
    const existing = this.probes.get(cwd)
    if (existing !== undefined) return existing
    const probe = this.api.repo(cwd).then((view) => {
      if (view === null || this.disposed) return undefined
      this.mergeRepo(view)
      return view.current
    }, () => undefined)
    this.probes.set(cwd, probe)
    return probe
  }

  /**
   * Select the worktree that contains `cwd` unless the user has picked one by hand.
   * Used to follow the current chat session.
   */
  async follow(cwd: string): Promise<void> {
    const current = await this.discover(cwd)
    if (current === undefined || this.pinned || this.disposed) return
    this.selectInternal(current)
  }

  /** The user picked a worktree: keep it selected even when the chat session changes, and reveal its changes. */
  select(path: string): void {
    this.pinned = true
    this.selectInternal(path)
    this.reveal?.()
  }

  /** Register (or clear) how to bring the Changes tab into view. Owned by the Changes tab plugin. */
  setReveal(reveal: (() => void) | undefined): void {
    this.reveal = reveal
  }

  /** Reload the worktree list of every known repository and the status of every worktree. */
  async refreshAll(): Promise<void> {
    const roots = this.snapshot.repos.map(repo => repo.root)
    await Promise.all(roots.map(async (root) => {
      const view = await this.api.repo(root).catch(() => null)
      if (view !== null && !this.disposed) this.mergeRepo(view)
    }))
    for (const repo of this.snapshot.repos) {
      await Promise.all(repo.worktrees.map(worktree => this.refreshStatus(worktree.path)))
    }
  }

  /** Reload one worktree's changed files. Concurrent calls for the same path share one request. */
  refreshStatus(path: string): Promise<void> {
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

  /** Ask the canvas to open (or focus) a diff tile for one changed file. */
  openDiff(request: OpenDiffRequest): void {
    for (const listener of this.diffListeners) listener(request)
  }

  /** @returns disposer. */
  onOpenDiff(listener: (request: OpenDiffRequest) => void): () => void {
    this.diffListeners.add(listener)
    return () => { this.diffListeners.delete(listener) }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.diffListeners.clear()
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

  private mergeRepo(view: GitRepoView): void {
    const previous = this.snapshot.repos.find(repo => repo.root === view.root)
    const worktrees = view.worktrees.map((listed) => {
      const before = previous?.worktrees.find(worktree => worktree.path === listed.path)
      return before === undefined
        ? freshWorktree(listed.path, listed.branch, listed.main)
        : { ...before, branch: listed.branch, main: listed.main }
    })
    const next: RepoState = { root: view.root, name: view.name, worktrees }
    const others = this.snapshot.repos.filter(repo => repo.root !== view.root)
    const repos = [...others, next].sort((a, b) => a.name.localeCompare(b.name))
    const selectedGone = this.snapshot.selectedPath !== undefined
      && previous !== undefined
      && !worktrees.some(worktree => worktree.path === this.snapshot.selectedPath)
      && previous.worktrees.some(worktree => worktree.path === this.snapshot.selectedPath)
    this.replace({
      ...this.snapshot,
      repos: Object.freeze(repos),
      selectedPath: selectedGone ? undefined : this.snapshot.selectedPath,
    })
    // A worktree seen for the first time gets its status now, so its dot does not sit on "loading"
    // until the next poll tick.
    for (const worktree of worktrees) {
      if (previous?.worktrees.some(before => before.path === worktree.path) !== true) {
        void this.refreshStatus(worktree.path)
      }
    }
  }

  private patchWorktree(path: string, patch: Partial<WorktreeState>): void {
    let changed = false
    const repos = this.snapshot.repos.map((repo) => {
      if (!repo.worktrees.some(worktree => worktree.path === path)) return repo
      changed = true
      return {
        ...repo,
        worktrees: repo.worktrees.map(worktree => worktree.path === path ? { ...worktree, ...patch } : worktree),
      }
    })
    if (changed) this.replace({ ...this.snapshot, repos: Object.freeze(repos) })
  }

  private replace(snapshot: ShellSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of [...this.listeners]) listener()
  }
}
