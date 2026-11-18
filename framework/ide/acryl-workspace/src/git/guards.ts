/** Checks on what a caller may hand to git, before git sees it. */

import { MAX_STAGE_FILES } from './contract.ts'
import { WorkspaceGitError } from './errors.ts'

/**
 * A conservative first filter, before git's own check: letters, digits, `.`, `_`, `-` and `/`
 * separators, starting with a letter, digit or underscore. It keeps the branch usable as one folder
 * name and can never look like an option or a path escape.
 */
export function assertBranchName(branch: string): void {
  if (typeof branch !== 'string' || branch.length === 0 || branch.length > 200
    || !/^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(branch)
    || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) {
    throw new WorkspaceGitError('branch names use letters, digits, ".", "_", "-" and "/", and start with a letter, digit or "_"', 'invalid')
  }
}

export function assertFileList(files: readonly string[]): void {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_STAGE_FILES) {
    throw new WorkspaceGitError(`name between 1 and ${String(MAX_STAGE_FILES)} files`, 'invalid')
  }
  for (const file of files) assertRelativeFile(file)
}

export function assertRelativeFile(file: string): void {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || file.includes('\0')
    || file.startsWith('/') || file.startsWith('-') || /(^|[\\/])\.\.([\\/]|$)/.test(file)) {
    throw new WorkspaceGitError('file must be a relative path inside the worktree', 'invalid')
  }
}
