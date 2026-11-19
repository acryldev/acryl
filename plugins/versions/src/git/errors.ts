/** Errors of the Versions git modules. */

/**
 * A request the caller got wrong (400), a directory that is not a repository (404), something that
 * cannot be done in the current state (409), or a git failure (500).
 *
 * `detail` carries a short, already-safe summary of git's own message for the one caller that shows
 * it to the user (a refused push). Other routes answer with a fixed reason and never leak it.
 */
export class VersionsGitError extends Error {
  constructor(message: string, readonly kind: 'invalid' | 'not-repo' | 'conflict' | 'failed', readonly detail?: string) {
    super(message)
    this.name = 'VersionsGitError'
  }
}
