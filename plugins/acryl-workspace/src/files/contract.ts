/** Loopback routes and JSON shapes for browsing, reading and saving files inside a git worktree. */

export const WORKSPACE_FILES_TREE_PATH = '/api/acryl-workspace/files/tree'
export const WORKSPACE_FILES_READ_PATH = '/api/acryl-workspace/files/read'
export const WORKSPACE_FILES_WRITE_PATH = '/api/acryl-workspace/files/write'

/** The largest file the editor opens or saves. */
export const MAX_EDITABLE_BYTES = 2 * 1024 * 1024

export type FileEntryKind = 'file' | 'dir'

export interface FileEntry {
  /** Base name, without any directory part. */
  readonly name: string
  readonly kind: FileEntryKind
}

/** One directory of a worktree. */
export interface FilesTreeView {
  /** Absolute worktree path. */
  readonly path: string
  /** Directory relative to the worktree, `''` for its root. */
  readonly dir: string
  /** Directories first, then files, each alphabetical. */
  readonly entries: readonly FileEntry[]
  /** True when the directory had more entries than the cap. */
  readonly truncated: boolean
}

export interface FileContentView {
  readonly path: string
  readonly file: string
  /** UTF-8 text; empty when `binary`. */
  readonly content: string
  readonly binary: boolean
  readonly size: number
  /** Modification time on disk, sent back when saving to detect an outside change. */
  readonly mtimeMs: number
}

export interface FileSavedView {
  readonly path: string
  readonly file: string
  readonly size: number
  readonly mtimeMs: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isEntry(value: unknown): value is FileEntry {
  return isRecord(value) && typeof value.name === 'string' && (value.kind === 'file' || value.kind === 'dir')
}

/** @param value - unknown JSON from the tree route. */
export function parseFilesTreeView(value: unknown): FilesTreeView {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.dir !== 'string'
    || typeof value.truncated !== 'boolean' || !Array.isArray(value.entries) || !value.entries.every(isEntry)) {
    throw new Error('invalid files tree response')
  }
  return { path: value.path, dir: value.dir, entries: value.entries, truncated: value.truncated }
}

/** @param value - unknown JSON from the read route. */
export function parseFileContentView(value: unknown): FileContentView {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.file !== 'string'
    || typeof value.content !== 'string' || typeof value.binary !== 'boolean'
    || typeof value.size !== 'number' || typeof value.mtimeMs !== 'number') {
    throw new Error('invalid file response')
  }
  return { path: value.path, file: value.file, content: value.content, binary: value.binary, size: value.size, mtimeMs: value.mtimeMs }
}

/** @param value - unknown JSON from the write route. */
export function parseFileSavedView(value: unknown): FileSavedView {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.file !== 'string'
    || typeof value.size !== 'number' || typeof value.mtimeMs !== 'number') {
    throw new Error('invalid file save response')
  }
  return { path: value.path, file: value.file, size: value.size, mtimeMs: value.mtimeMs }
}
