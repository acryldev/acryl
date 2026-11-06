// A plugin's identity: what makes two copies of it the same plugin. Pure, over plain files, so a folder on disk, a fetched registry entry
// and a test all reach one formula (Clean Architecture: policy free of I/O; Pragmatic Programmer: DRY). The lock, staging and the registry
// all rely on this formula, so changing it rewrites every lock.
import { createHash } from 'node:crypto'

/** One file of a plugin, whatever it was read from. `path` is relative to the plugin, with `/` on every platform. */
export type PluginFile = {
  readonly path: string
  /** The content; for a symbolic link, the bytes a loader reads through it. */
  readonly bytes: Uint8Array
  readonly kind: 'file' | 'symlink'
}

/** Names skipped wherever they appear: dependencies, git metadata, and the source pointer ACRYL writes into a staged copy. */
export const FOLDER_DIGEST_SKIPPED: ReadonlySet<string> = new Set(['node_modules', '.git', 'acryl-source.json'])
/** ACRYL's staged versions of a plugin (`acryl-v-<hash>/`), copies of the folder itself. */
export const FOLDER_DIGEST_SKIPPED_PREFIX = 'acryl-v-'

/** Whether a file or folder of this name is never part of a plugin's own source. */
export function isSkippedName(name: string): boolean {
  return FOLDER_DIGEST_SKIPPED.has(name) || name.startsWith(FOLDER_DIGEST_SKIPPED_PREFIX)
}

/** The files that are the plugin itself, in code-unit order of their paths (not a locale's, which would differ between machines). */
export function ownFiles(files: readonly PluginFile[]): PluginFile[] {
  return files
    .filter((file) => !file.path.split('/').some(isSkippedName))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

/** The sha256 over each own file's relative path and bytes, in path order, as lowercase hex. */
export function digestFiles(files: readonly PluginFile[]): string {
  const hash = createHash('sha256')
  for (const { path, bytes } of ownFiles(files)) hash.update(path).update('\0').update(bytes).update('\0')
  return hash.digest('hex')
}
