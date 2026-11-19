/**
 * `SharedContext`: which Shared Context workspace a folder works in, and what an agent there is told (spec 043 T009). It keeps
 * `<home>/workspaces/<id>/WORKSPACE.md` current for every shared workspace and holds each workspace's brief (`BRIEF.md`, the user's).
 * Provided as the `acrylSharedContext` service, so another mechanism can replace it (FR-005).
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { ProjectRegistryView, WorkspaceSummary } from '../projects/contract.ts'
import { contextLaunch, type ContextLaunch } from './launch.ts'
import { renderContextDocument, renderContextPrompt, type ContextInput } from './render.ts'

/** The service name other plugins read. */
export const SHARED_CONTEXT_SERVICE = 'acrylSharedContext'

/** A brief longer than this is refused: it is a page of notes, not a store. */
export const MAX_BRIEF_CHARS = 100_000

const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', 'README.md'] as const

export interface SharedContextRegistry {
  view(): ProjectRegistryView
  onChange(listener: (view: ProjectRegistryView) => void): () => void
}

/** What a terminal agent or the chat gets for one workspace. */
export interface WorkspaceContext {
  readonly workspace: WorkspaceSummary
  /** The prompt block (within the budget). */
  readonly prompt: string
  /** The generated document's path. */
  readonly documentPath: string
  /** The workspace's projects other than the one the agent starts in. */
  readonly otherProjects: (folder: string) => readonly string[]
}

/** `path` is `folder` or below it, with either separator. */
export function isInside(path: string, folder: string): boolean {
  if (path === folder) return true
  const base = folder.replace(/[\\/]+$/u, '')
  return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`)
}

/**
 * The checkout a folder belongs to: the nearest folder above it with `.git`; for a linked worktree (`.git` is a file pointing into
 * `<main>/.git/worktrees/<name>`), the main checkout. Synchronous and git-free, so a prompt provider can call it. The main checkout is spelled
 * the way git wrote it (on Windows long names and `/`, turned into native separators here), so compare it with `samePlaceOrInside`, not as text.
 */
export function checkoutOf(folder: string): string | undefined {
  for (let current = resolve(folder); ; current = dirname(current)) {
    const marker = join(current, '.git')
    if (existsSync(marker)) {
      try {
        if (statSync(marker).isFile()) {
          const pointer = /^gitdir:\s*(.+)$/mu.exec(readFileSync(marker, 'utf8'))?.[1]?.trim()
          const at = pointer?.search(/[\\/]\.git[\\/]worktrees[\\/]/u) ?? -1
          if (pointer !== undefined && at > 0) return resolve(pointer.slice(0, at))
        }
      } catch {
        // An unreadable marker: the folder itself is the checkout.
      }
      return current
    }
    if (dirname(current) === current) return undefined
  }
}

/** A path as the file system names it (Windows 8.3 short names, letter case and symlinks resolved); a missing path only resolved. */
function canonical(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

/** `path` is `folder` or below it, however each is spelled (see `canonical`). */
export function samePlaceOrInside(path: string, folder: string): boolean {
  return isInside(path, folder) || isInside(canonical(path), canonical(folder))
}

export class SharedContext {
  constructor(private readonly deps: { readonly registry: SharedContextRegistry, readonly home: string }) {}

  /** `<home>/workspaces/<id>/`. */
  folder(id: string): string {
    return join(this.deps.home, 'workspaces', id)
  }

  briefPath(id: string): string {
    return join(this.folder(id), 'BRIEF.md')
  }

  documentPath(id: string): string {
    return join(this.folder(id), 'WORKSPACE.md')
  }

  /**
   * The Shared Context workspace an agent working in `folder` belongs to: the shown workspace when it is shared and holds the folder, else
   * the first shared one that does; `undefined` in an Individual Projects workspace (nothing crosses projects there).
   */
  forFolder(folder: string): WorkspaceSummary | undefined {
    const view = this.deps.registry.view()
    const checkout = checkoutOf(folder)
    const places = checkout === undefined ? [folder] : [folder, checkout]
    const holds = (workspace: WorkspaceSummary): boolean => workspace.kind === 'shared' && workspace.projects.some(project => places.some(place => samePlaceOrInside(place, project)))
    const shown = view.workspaces.find(workspace => workspace.id === view.current)
    if (shown !== undefined && holds(shown)) return shown
    return view.workspaces.find(holds)
  }

  /** What an agent working in `folder` is told, or `undefined` outside a Shared Context workspace. */
  contextFor(folder: string): WorkspaceContext | undefined {
    const workspace = this.forFolder(folder)
    if (workspace === undefined) return undefined
    return {
      workspace,
      prompt: renderContextPrompt(this.input(workspace)),
      documentPath: this.documentPath(workspace.id),
      otherProjects: (start: string) => {
        const checkout = checkoutOf(start) ?? start
        return workspace.projects.filter(project => !samePlaceOrInside(start, project) && !samePlaceOrInside(checkout, project))
      },
    }
  }

  /** What a terminal agent started in `cwd` is given (`WorkspacePtyRegistry`'s launch context): nothing outside a shared workspace. */
  launchFor(agentId: string, cwd: string): ContextLaunch | undefined {
    const context = this.contextFor(cwd)
    if (context === undefined) return undefined
    return contextLaunch(agentId, { prompt: context.prompt, documentPath: context.documentPath, otherProjects: context.otherProjects(cwd), workspaceFolder: this.folder(context.workspace.id) })
  }

  /** The prompt block for a workspace by id (the tool's answer), or `undefined` when it is not a shared workspace. */
  promptFor(id: string): string | undefined {
    const workspace = this.deps.registry.view().workspaces.find(candidate => candidate.id === id)
    return workspace?.kind === 'shared' ? renderContextPrompt(this.input(workspace)) : undefined
  }

  brief(id: string): string {
    try {
      return readFileSync(this.briefPath(id), 'utf8')
    } catch {
      return ''
    }
  }

  /** Save a workspace's brief and rewrite its document. @throws when the workspace does not exist or the brief is too long. */
  setBrief(id: string, text: string): void {
    const workspace = this.deps.registry.view().workspaces.find(candidate => candidate.id === id)
    if (workspace === undefined) throw new Error(`there is no workspace ${id}`)
    if (text.length > MAX_BRIEF_CHARS) throw new Error(`the brief is longer than ${String(MAX_BRIEF_CHARS)} characters`)
    writeAtomically(this.briefPath(id), text)
    if (workspace.kind === 'shared') writeAtomically(this.documentPath(id), renderContextDocument(this.input(workspace)))
  }

  /** Rewrite `WORKSPACE.md` for every shared workspace. */
  writeDocuments(view: ProjectRegistryView = this.deps.registry.view()): void {
    for (const workspace of view.workspaces) {
      if (workspace.kind === 'shared') writeAtomically(this.documentPath(workspace.id), renderContextDocument(this.input(workspace)))
    }
  }

  /** Keep the documents current as the registry changes. @returns disposer, for one owning effect. */
  start(report: (cause: unknown) => void): () => void {
    const write = (view?: ProjectRegistryView): void => {
      try { this.writeDocuments(view) } catch (cause) { report(cause) }
    }
    write()
    return this.deps.registry.onChange(write)
  }

  private input(workspace: WorkspaceSummary): ContextInput {
    return {
      name: workspace.name,
      projects: workspace.projects.map(path => ({
        name: basename(path),
        path,
        instructions: INSTRUCTION_FILES.filter(file => existsSync(join(path, file))),
      })),
      brief: this.brief(workspace.id),
      documentPath: this.documentPath(workspace.id),
      briefPath: this.briefPath(workspace.id),
    }
  }
}

function writeAtomically(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${String(process.pid)}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, path)
}
