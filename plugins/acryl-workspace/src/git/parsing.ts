/** Parsers for the machine-readable output of `git worktree`, `git diff --numstat` and `git status`. */

import type { GitChange, GitChangeCode, GitWorktree } from './contract.ts'

/** Parse `git worktree list --porcelain`. Git always lists the main worktree first. */
export function parseWorktrees(text: string): GitWorktree[] {
  const worktrees: GitWorktree[] = []
  for (const block of text.split(/\n\n+/)) {
    let path: string | undefined
    let head = ''
    let branch: string | null = null
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
    if (path !== undefined) worktrees.push({ path, head, branch, main: worktrees.length === 0 })
  }
  return worktrees
}

interface LineCount {
  readonly added: number | null
  readonly removed: number | null
}

/** Parse `git diff --numstat -z`. Binary files report `-` and map to null counts. */
export function parseNumstat(text: string): Map<string, LineCount> {
  const counts = new Map<string, LineCount>()
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '') continue
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token)
    if (match === null) continue
    let path = match[3] ?? ''
    // A rename carries an empty path here, then the old and new paths as the next two tokens.
    if (path === '') {
      path = tokens[index + 2] ?? ''
      index += 2
    }
    counts.set(path, {
      added: match[1] === '-' ? null : Number(match[1]),
      removed: match[2] === '-' ? null : Number(match[2]),
    })
  }
  return counts
}

function classify(x: string, y: string): { code: GitChangeCode; staged: boolean } {
  if (x === '?' && y === '?') return { code: '?', staged: false }
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return { code: 'U', staged: false }
  }
  const staged = x !== ' '
  let code: string
  if (x === 'A' || x === 'C') code = 'A'
  else if (x === 'R') code = 'R'
  else code = y !== ' ' ? y : x
  if (code === 'T') code = 'M'
  return { code: (['M', 'A', 'D', 'R'].includes(code) ? code : 'M') as GitChangeCode, staged }
}

/** Parse `git status --porcelain=v1 -z`, attaching line counts where git reported them. */
export function parsePorcelain(text: string, counts: ReadonlyMap<string, LineCount>): GitChange[] {
  const changes: GitChange[] = []
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token.length < 4) continue
    const x = token[0] ?? ' '
    const y = token[1] ?? ' '
    if (x === '!' && y === '!') continue
    const path = token.slice(3)
    let oldPath: string | undefined
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      oldPath = tokens[index + 1]
      index += 1
    }
    const { code, staged } = classify(x, y)
    const count = counts.get(path)
    changes.push({
      path,
      code,
      staged,
      added: count?.added ?? null,
      removed: count?.removed ?? null,
      ...(oldPath === undefined ? {} : { oldPath }),
    })
  }
  return changes
}
