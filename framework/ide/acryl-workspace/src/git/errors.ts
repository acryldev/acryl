/** Errors of the Workspace git modules. */

/**
 * A request the caller got wrong (400), a directory that is not a repository (404), something that
 * already exists (409), or a git failure (500).
 */
export class WorkspaceGitError extends Error {
  constructor(message: string, readonly kind: 'invalid' | 'not-repo' | 'conflict' | 'failed') {
    super(message)
    this.name = 'WorkspaceGitError'
  }
}
