/** Repo-wide search over the files git tracks or would track: by name or by content. */

import type { GitSearchMode, GitSearchView } from './contract.ts'
import { MAX_SEARCH_QUERY, MAX_SEARCH_RESULTS } from './contract.ts'
import { WorkspaceGitError } from './errors.ts'
import type { GitRunner } from './runner.ts'

export class WorkspaceSearch {
  constructor(private readonly git: GitRunner) {}

  /**
   * Find files by name, or lines by content, among the tracked and untracked files git does not ignore.
   * Case-insensitive and literal (the query is never a pattern), so it cannot be a regular-expression trap.
   * @param path - absolute worktree directory.
   * @param query - what to look for.
   */
  async search(path: string, query: string, mode: GitSearchMode): Promise<GitSearchView> {
    const dir = await this.git.resolveDirectory(path)
    const text = typeof query === 'string' ? query.trim() : ''
    if (text === '' || text.length > MAX_SEARCH_QUERY || text.includes('\0') || (mode !== 'name' && mode !== 'content')) {
      throw new WorkspaceGitError('type something to search for (up to 200 characters)', 'invalid')
    }
    if (mode === 'name') {
      const listed = await this.git.run(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], dir)
      const needle = text.toLowerCase()
      const matches = listed.stdout.split('\0').filter(file => file !== '' && file.toLowerCase().includes(needle))
      // A match in the file's own name outranks one in a folder name; then shorter and alphabetical.
      const inName = (file: string): boolean => (file.split('/').pop() ?? file).toLowerCase().includes(needle)
      matches.sort((a, b) => Number(inName(b)) - Number(inName(a)) || a.length - b.length || a.localeCompare(b))
      return {
        path: dir, query: text, mode,
        hits: matches.slice(0, MAX_SEARCH_RESULTS).map(file => ({ file })),
        truncated: matches.length > MAX_SEARCH_RESULTS || listed.truncated,
      }
    }
    const found = await this.git.run(['grep', '-n', '-I', '-i', '-F', '-z', '--untracked', '-e', text, '--'], dir, 1)
    const hits: { file: string; line: number; text: string }[] = []
    let truncated = found.truncated
    // With -z each hit is `file NUL line NUL text` and hits are separated by a newline.
    for (const record of found.stdout.split('\n')) {
      if (record === '') continue
      const [file, line, ...rest] = record.split('\0')
      if (file === undefined || line === undefined || !/^\d+$/.test(line)) continue
      if (hits.length >= MAX_SEARCH_RESULTS) { truncated = true; break }
      hits.push({ file, line: Number(line), text: rest.join('\0').slice(0, 300) })
    }
    return { path: dir, query: text, mode, hits, truncated }
  }
}
