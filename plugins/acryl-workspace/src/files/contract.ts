/** Loopback routes and JSON shapes for browsing, reading and saving files inside a git worktree. */

export const WORKSPACE_FILES_TREE_PATH = '/api/acryl-workspace/files/tree'
export const WORKSPACE_FILES_READ_PATH = '/api/acryl-workspace/files/read'
export const WORKSPACE_FILES_WRITE_PATH = '/api/acryl-workspace/files/write'
export const WORKSPACE_FILES_ENTRY_PATH = '/api/acryl-workspace/files/entry'

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

/**
 * One structural change to a worktree's files. Deliberately small: create a file or an empty folder,
 * rename or move an entry, delete a file or an empty folder. Nothing overwrites, nothing recurses.
 */
export type FileEntryChange =
  | { readonly op: 'create'; readonly kind: FileEntryKind; readonly file: string }
  | { readonly op: 'rename'; readonly file: string; readonly to: string }
  | { readonly op: 'delete'; readonly file: string }

/** The result of a structural change: what now exists (null after a delete). */
export interface FileEntryChangedView {
  readonly path: string
  readonly op: FileEntryChange['op']
  readonly file: string | null
}

/** @param value - unknown JSON from the entry route. */
export function parseFileEntryChangedView(value: unknown): FileEntryChangedView {
  if (!isRecord(value) || typeof value.path !== 'string'
    || (value.op !== 'create' && value.op !== 'rename' && value.op !== 'delete')
    || (value.file !== null && typeof value.file !== 'string')) {
    throw new Error('invalid file change response')
  }
  return { path: value.path, op: value.op, file: value.file }
}

/** Validate an untrusted request body into a change, or null when it is not one. */
export function parseFileEntryChange(value: unknown): FileEntryChange | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value).filter(key => key !== 'path').sort().join(',')
  if (value.op === 'create' && keys === 'file,kind,op' && typeof value.file === 'string' && (value.kind === 'file' || value.kind === 'dir')) {
    return { op: 'create', kind: value.kind, file: value.file }
  }
  if (value.op === 'rename' && keys === 'file,op,to' && typeof value.file === 'string' && typeof value.to === 'string') {
    return { op: 'rename', file: value.file, to: value.to }
  }
  if (value.op === 'delete' && keys === 'file,op' && typeof value.file === 'string') return { op: 'delete', file: value.file }
  return null
}
