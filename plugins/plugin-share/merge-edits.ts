/**
 * A pulled plugin pulled again at a newer release, with the person's own edits in its folder. Three trees meet: `base` (the release they pulled), `mine` (the
 * folder now) and `theirs` (the new release). A file only one side changed takes that side's change; a file both changed is merged line by line, and the
 * merge is refused when the changes overlap. Pure over bytes, except the line merge, which is git's (`git merge-file`) and is passed in so a test needs no git.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A plugin's files by their `/` path. */
export type Tree = ReadonlyMap<string, Uint8Array>

/** Merge one text file three ways: the merged bytes, or undefined when the two changes overlap. */
export type MergeFile = (
  base: Uint8Array,
  mine: Uint8Array,
  theirs: Uint8Array,
) => Uint8Array | undefined

export interface MergedTrees {
  /** What the folder holds afterwards. */
  readonly files: ReadonlyMap<string, Uint8Array>
  /** The files that keep something of the person's own: their edit stands, or it was merged with the release's change. */
  readonly kept: readonly string[]
  /** The files whose changes overlap, or that one side changed and the other removed: nothing is written while there is one. */
  readonly conflicts: readonly string[]
}

const same = (a: Uint8Array | undefined, b: Uint8Array | undefined): boolean =>
  a === undefined || b === undefined ? a === b : Buffer.from(a).equals(b)

/** git's own three-way line merge. A binary file, a conflict, or no git on this computer is "cannot merge". */
export const gitMergeFile: MergeFile = (base, mine, theirs) => {
  if ([base, mine, theirs].some((bytes) => bytes.includes(0))) return undefined
  const dir = mkdtempSync(join(tmpdir(), 'plugin-merge-'))
  try {
    const [b, m, t] = ['base', 'mine', 'theirs'].map((name) => join(dir, name)) as [
      string,
      string,
      string,
    ]
    writeFileSync(b, base)
    writeFileSync(m, mine)
    writeFileSync(t, theirs)
    // `-p` prints the result; the status is the number of conflicts (0 = clean), negative on an error.
    const result = spawnSync('git', ['merge-file', '-p', m, b, t], { maxBuffer: 64 * 1024 * 1024 })
    return result.error === undefined && result.status === 0 ? result.stdout : undefined
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** shortcut: a symlink is read as the file it points at and written back as a file; a plugin that is pulled holds none (portability refuses them). */
export function mergeTrees(
  base: Tree,
  mine: Tree,
  theirs: Tree,
  mergeFile: MergeFile = gitMergeFile,
): MergedTrees {
  const files = new Map<string, Uint8Array>()
  const kept: string[] = []
  const conflicts: string[] = []
  const paths = [...new Set([...base.keys(), ...mine.keys(), ...theirs.keys()])].sort()
  for (const path of paths) {
    const [b, m, t] = [base.get(path), mine.get(path), theirs.get(path)]
    const put = (bytes: Uint8Array | undefined): void => {
      if (bytes !== undefined) files.set(path, bytes)
    }
    if (same(m, t)) put(m)
    else if (same(m, b)) put(t)
    else if (same(t, b)) {
      put(m)
      kept.push(path)
    } else if (b !== undefined && m !== undefined && t !== undefined) {
      const merged = mergeFile(b, m, t)
      if (merged === undefined) conflicts.push(path)
      else {
        files.set(path, merged)
        kept.push(path)
      }
    } else conflicts.push(path)
  }
  return { files, kept, conflicts }
}
