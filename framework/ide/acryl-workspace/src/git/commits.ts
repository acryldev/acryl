/** Committing what is staged. It never pushes and never bypasses hooks. */

import type { GitCommitView } from './contract.ts'
import { MAX_COMMIT_MESSAGE } from './contract.ts'
import type { WorkspaceChanges } from './changes.ts'
import { WorkspaceGitError } from './errors.ts'
import type { GitRunner } from './runner.ts'

const COMMIT_TIMEOUT_MS = 120_000

export class WorkspaceCommits {
  constructor(private readonly git: GitRunner, private readonly changes: WorkspaceChanges) {}

  /**
   * Commit what is staged. Refuses an empty message, nothing staged, or a missing git identity with a reason the
   * user can act on; never pushes, and never bypasses hooks.
   */
  async commit(path: string, message: string): Promise<GitCommitView> {
    const dir = await this.git.resolveDirectory(path)
    const text = typeof message === 'string' ? message.trim() : ''
    if (text === '' || text.length > MAX_COMMIT_MESSAGE || text.includes('\0')) {
      throw new WorkspaceGitError('write a commit message (up to 5000 characters)', 'invalid')
    }
    if ((await this.git.run(['diff', '--cached', '--name-only', '-z'], dir)).stdout === '') {
      throw new WorkspaceGitError('nothing is staged to commit', 'conflict')
    }
    try {
      await this.git.run(['var', 'GIT_AUTHOR_IDENT'], dir)
    } catch {
      throw new WorkspaceGitError('git does not know who you are: set user.name and user.email first', 'conflict')
    }
    try {
      await this.git.run(['commit', '-q', '-m', text], dir, undefined, COMMIT_TIMEOUT_MS)
    } catch {
      throw new WorkspaceGitError('git could not commit (a commit hook may have refused it)', 'conflict')
    }
    const [hash, subject] = await Promise.all([
      this.git.run(['rev-parse', '--short', 'HEAD'], dir),
      this.git.run(['log', '-1', '--format=%s'], dir),
    ])
    return { hash: hash.stdout.trim(), subject: subject.stdout.trim(), status: await this.changes.status(dir) }
  }
}
