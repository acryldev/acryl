// The two outside systems saving talks to, as ports (Clean Architecture): the use cases in save.ts and connect.ts depend on these interfaces, and the
// adapters (adapters.ts) implement them with the user's own git and gh.
import type { Visibility } from './identity.js'

export interface GitPort {
  isRepository(): boolean
  init(): void
  /** Stage every change (the app's .gitignore keeps runtime data out). */
  stageAll(): void
  /** Paths staged for the next commit (added or modified; deletions excluded). */
  stagedFiles(): string[]
  /** The staged content of one file, or undefined for a binary file. */
  stagedText(path: string): string | undefined
  unstageAll(): void
  hasStagedChanges(): boolean
  commit(message: string): string
  /** The current commit (`HEAD`), for reporting a save that only pushed - no new commit was made. */
  headCommit(): string
  remoteUrl(name?: string): string | undefined
  addRemote(url: string, name?: string): void
  push(): void
  /**
   * Whether `HEAD` has commits the remote does not (a connected remote that has never been pushed to counts as
   * unpushed): a save with nothing new to commit still has work to do, and `saveApp` must not report
   * `nothing-to-save` while leaving it stranded on the remote.
   */
  hasUnpushedCommits(): boolean
}

export interface HostingPort {
  /** Whether a remote is public, private, or unknown (a host the adapter cannot ask). */
  visibilityOf(remoteUrl: string): Visibility | 'unknown'
  /** Create a repository for the app and return its clone URL. */
  create(name: string, visibility: Visibility): string
}
