/**
 * Repo-relative file paths for the `@`-mention dropdown (`PromptInput.tsx`).
 * Reader-local convenience, so — like `!`-shell-mode's `runShell` in
 * `src/index.ts` — this goes straight to `node:child_process`/`node:fs`
 * rather than through `ctx.fs` (which is for the agent's own sandboxed tool
 * execution, a different concern from listing files for local autocomplete).
 * @module @tomowang/dsh-tui/tui/fileIndex
 */

import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Hard cap on the fallback recursive walk so a huge non-git tree can't hang the prompt. */
export const FILE_INDEX_MAX_ENTRIES = 5000

/** Directory names the fallback walk never descends into. */
const WALK_EXCLUDES = new Set(['.git', 'node_modules'])

/**
 * List candidate file paths under `cwd`, relative to `cwd`.
 * @param cwd - root to list from.
 * @returns tracked and untracked-but-not-gitignored paths via `git ls-files`
 * when `cwd` is inside a git repo; otherwise a bounded recursive walk.
 */
export async function loadFileIndex(cwd: string): Promise<string[]> {
  const fromGit = await listGitFiles(cwd)
  if (fromGit !== undefined) return fromGit
  return walkDirectory(cwd)
}

function listGitFiles(cwd: string): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    let out = ''
    let child
    try {
      child = spawn('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      resolve(undefined)
      return
    }
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', () => resolve(undefined))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(undefined)
        return
      }
      resolve(out.split('\n').filter(line => line.length > 0))
    })
  })
}

async function walkDirectory(cwd: string): Promise<string[]> {
  const results: string[] = []
  const queue = [cwd]
  while (queue.length > 0 && results.length < FILE_INDEX_MAX_ENTRIES) {
    const dir = queue.shift()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (results.length >= FILE_INDEX_MAX_ENTRIES) break
      if (entry.isDirectory()) {
        if (WALK_EXCLUDES.has(entry.name)) continue
        queue.push(join(dir, entry.name))
        continue
      }
      if (entry.isFile()) results.push(relative(cwd, join(dir, entry.name)))
    }
  }
  return results
}
