/** What the page knows of the project registry: the Host's workspaces and the shown one's projects, the moment it arrived, and who is listening. */

import type { ProjectRegistryView, WorkspaceKind, WorkspaceSummary } from '../../projects/contract.ts'
import type { ProjectRegistryApi } from './registry-api.ts'

const EMPTY: ProjectRegistryView = Object.freeze({ paths: [], adopted: false, workspaces: [], current: 'default' })

export type ProjectChange = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export class ProjectRegistryState {
  private view: ProjectRegistryView = EMPTY
  private loadedOnce = false
  private readonly listeners = new Set<() => void>()

  /** @param initial - a list already known (a test's, or one the page was handed), which counts as loaded. */
  constructor(private readonly api: ProjectRegistryApi, initial?: ProjectRegistryView) {
    if (initial !== undefined) { this.view = initial; this.loadedOnce = true }
  }

  /** The list has been read from the Host at least once. Until then an empty list means "not known yet". */
  get loaded(): boolean { return this.loadedOnce }

  get adopted(): boolean { return this.view.adopted }

  /** The shown workspace's projects. */
  paths(): readonly string[] { return this.view.paths }

  /** Every workspace, Default first. The same array until the Host's answer changes it. */
  workspaces(): readonly WorkspaceSummary[] { return this.view.workspaces }

  /** The id of the workspace the sidebar shows. */
  current(): string { return this.view.current }

  /** A primitive that changes exactly when the shown workspace or its projects do, safe to subscribe to. */
  key(): string { return `${this.view.current}\n${this.view.paths.join('\n')}` }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Read the list from the Host. A failure leaves the state as it was and says why. */
  async load(): Promise<ProjectChange> {
    return this.apply(() => this.api.load())
  }

  /** A view the Host pushed (its event stream): a change made elsewhere, by an agent's tool or another window. */
  receive(view: ProjectRegistryView): void {
    void this.apply(() => Promise.resolve(view))
  }

  add(path: string): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'add', path }))
  }

  remove(path: string): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'remove', path }))
  }

  adopt(paths: readonly string[]): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'adopt', paths }))
  }

  /** Create a workspace; the Host shows it at once. */
  createWorkspace(input: { readonly name: string, readonly kind: WorkspaceKind, readonly remote?: { readonly host: string, readonly user?: string, readonly path?: string } }): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'create-workspace', ...input }))
  }

  switchWorkspace(id: string): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'switch-workspace', id }))
  }

  renameWorkspace(id: string, name: string): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'rename-workspace', id, name }))
  }

  deleteWorkspace(id: string): Promise<ProjectChange> {
    return this.apply(() => this.api.send({ op: 'delete-workspace', id }))
  }

  private async apply(run: () => Promise<ProjectRegistryView>): Promise<ProjectChange> {
    try {
      const next = await run()
      const changed = JSON.stringify(next) !== JSON.stringify(this.view)
      this.view = next
      const first = !this.loadedOnce
      this.loadedOnce = true
      if (changed || first) for (const listener of [...this.listeners]) listener()
      return { ok: true }
    } catch (cause) {
      return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
    }
  }
}

/** What adoption needs to read from the DeepSeek Harness chat's workspace list. */
export interface LegacyWorkspaceSource {
  getSnapshot(): { readonly phase: 'pending' | 'ready'; readonly items: ReadonlyArray<{ readonly path: string }> }
  subscribe(listener: () => void): () => void
}

/**
 * Take over, once, the folders that were registered as chat workspaces before ACRYL owned the list. It waits until both the registry and the workspace
 * list are known (adopting from a list that is still loading would mark the work done and lose the user's projects), then asks the Host to adopt them;
 * the Host applies it only once, so a second page or a reload changes nothing.
 * @returns disposer.
 */
export function adoptLegacyProjects(state: ProjectRegistryState, source: LegacyWorkspaceSource): () => void {
  let done = false
  let running = false
  const attempt = (): void => {
    if (done || running || !state.loaded) return
    if (state.adopted) { done = true; return }
    const snapshot = source.getSnapshot()
    if (snapshot.phase !== 'ready') return
    running = true
    void state.adopt(snapshot.items.map(item => item.path)).finally(() => { running = false; done = state.adopted })
  }
  const stopRegistry = state.subscribe(attempt)
  const stopSource = source.subscribe(attempt)
  attempt()
  return () => { stopRegistry(); stopSource() }
}
