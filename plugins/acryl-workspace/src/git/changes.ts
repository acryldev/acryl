/** What changed in a worktree: the status list, one file's diff, and staging. Nothing here commits. */

import type { GitDiffView, GitStatusView } from './contract.ts'
import { WorkspaceGitError } from './errors.ts'
import { assertFileList, assertRelativeFile } from './guards.ts'
import { parseNumstat, parsePorcelain } from './parsing.ts'
import { emptyResult, type GitRunner, type RunResult } from './runner.ts'

export class WorkspaceChanges {
  constructor(private readonly git: GitRunner, private readonly maxChanges: number) {}

  /**
   * Changed files in one worktree, versus HEAD.
   * @param path - absolute worktree directory.
   */
  async status(path: string): Promise<GitStatusView> {
    const dir = await this.git.resolveDirectory(path)
    const [porcelain, numstat, branch] = await Promise.all([
      this.git.run(['status', '--porcelain=v1', '-z', '--untracked-files=all'], dir),
      this.git.run(['diff', '--numstat', '-z', 'HEAD', '--'], dir).catch(emptyResult),
      this.git.run(['branch', '--show-current'], dir).catch(emptyResult),
    ])
    const counts = parseNumstat(numstat.stdout)
    const all = parsePorcelain(porcelain.stdout, counts)
    const truncated = porcelain.truncated || all.length > this.maxChanges
    const name = branch.stdout.trim()
    return {
      path: dir,
      branch: name === '' ? null : name,
      changes: all.slice(0, this.maxChanges),
      truncated,
    }
  }

  /**
   * Unified diff of one file against HEAD (untracked files diff against nothing).
   * @param path - absolute worktree directory.
   * @param file - path relative to that worktree.
   */
  async diff(path: string, file: string): Promise<GitDiffView> {
    const dir = await this.git.resolveDirectory(path)
    assertRelativeFile(file)
    const untracked = (await this.git.run(['ls-files', '--others', '--exclude-standard', '-z', '--', file], dir)).stdout.length > 0
    const flags = ['--no-color', '--no-ext-diff', '--no-textconv'] as const
    let result: RunResult
    if (untracked) {
      // `git diff --no-index` exits 1 when the files differ, which is the normal case here.
      result = await this.git.run(['diff', '--no-index', ...flags, '--', '/dev/null', file], dir, 1)
    } else {
      try {
        result = await this.git.run(['diff', ...flags, 'HEAD', '--', file], dir)
      } catch (cause) {
        // A repository with no commits has no HEAD; fall back to the index against the empty tree.
        if (!(cause instanceof WorkspaceGitError) || cause.kind !== 'failed') throw cause
        result = await this.git.run(['diff', '--cached', ...flags, '--', file], dir)
      }
    }
    const binary = /^Binary files .* differ$/m.test(result.stdout) || result.stdout.includes('GIT binary patch')
    return { path: dir, file, text: binary ? '' : result.stdout, binary, truncated: result.truncated }
  }

  /**
   * Stage files (`git add`), then report the worktree's status.
   * @param path - absolute worktree directory.
   * @param files - paths relative to that worktree.
   */
  async stage(path: string, files: readonly string[]): Promise<GitStatusView> {
    const dir = await this.git.resolveDirectory(path)
    assertFileList(files)
    await this.git.run(['add', '--', ...files], dir)
    return this.status(dir)
  }

  /**
   * Unstage files, keeping their working-tree changes, then report the status. Works before the first commit too.
   */
  async unstage(path: string, files: readonly string[]): Promise<GitStatusView> {
    const dir = await this.git.resolveDirectory(path)
    assertFileList(files)
    try {
      await this.git.run(['reset', '-q', 'HEAD', '--', ...files], dir)
    } catch {
      // No HEAD yet (an empty repository): dropping the paths from the index is the same thing.
      await this.git.run(['rm', '--cached', '-r', '-q', '--', ...files], dir)
    }
    return this.status(dir)
  }
}
