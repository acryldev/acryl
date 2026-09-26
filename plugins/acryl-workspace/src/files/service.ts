/**
 * Browsing, reading and saving files inside one git worktree.
 *
 * This is the only part of the package that writes user files, so every path is confined: the worktree
 * must be the root of a git worktree (checked by the injected resolver), a file path is relative and
 * free of `..` and `.git` segments, and the real path (after symlinks) must stay inside the worktree.
 * Saves are atomic (temp file then rename) and refuse to overwrite a file that changed on disk since it
 * was read.
 */

import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, readFile, realpath, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'
import {
  MAX_EDITABLE_BYTES,
  type FileContentView,
  type FileEntryChange,
  type FileEntryChangedView,
  type FileEntry,
  type FileSavedView,
  type FilesTreeView,
} from './contract.ts'

export type WorkspaceFilesErrorKind = 'invalid' | 'not-found' | 'conflict' | 'too-large' | 'failed'

export class WorkspaceFilesError extends Error {
  constructor(message: string, readonly kind: WorkspaceFilesErrorKind) {
    super(message)
    this.name = 'WorkspaceFilesError'
  }
}

const MAX_ENTRIES = 3000
const BINARY_SNIFF_BYTES = 8192

export interface WorkspaceFilesOptions {
  /** Validates that a path is the root of a git worktree and returns its real path. */
  readonly resolveWorktree: (path: string) => Promise<string>
}

export class WorkspaceFiles {
  constructor(private readonly options: WorkspaceFilesOptions) {}

  async tree(worktree: string, dir: string): Promise<FilesTreeView> {
    const root = await this.options.resolveWorktree(worktree)
    const target = dir === '' ? root : await confine(root, dir)
    let dirents
    try {
      if (!(await stat(target)).isDirectory()) throw new Error('not a directory')
      dirents = await readdir(target, { withFileTypes: true })
    } catch {
      throw new WorkspaceFilesError('that directory cannot be read', 'not-found')
    }
    const entries: FileEntry[] = []
    for (const dirent of dirents) {
      if (dirent.name === '.git') continue
      if (dirent.isDirectory()) entries.push({ name: dirent.name, kind: 'dir' })
      else if (dirent.isFile()) entries.push({ name: dirent.name, kind: 'file' })
      else if (dirent.isSymbolicLink()) {
        const kind = await symlinkKind(root, join(target, dirent.name))
        if (kind !== null) entries.push({ name: dirent.name, kind })
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) : a.kind === 'dir' ? -1 : 1))
    return { path: root, dir, entries: entries.slice(0, MAX_ENTRIES), truncated: entries.length > MAX_ENTRIES }
  }

  async read(worktree: string, file: string): Promise<FileContentView> {
    const root = await this.options.resolveWorktree(worktree)
    const real = await confine(root, file)
    const info = await statFile(real)
    if (info.size > MAX_EDITABLE_BYTES) throw new WorkspaceFilesError('the file is too large to edit here', 'too-large')
    const buffer = await readFile(real)
    const binary = buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
    return {
      path: root,
      file,
      content: binary ? '' : buffer.toString('utf8'),
      binary,
      size: info.size,
      mtimeMs: info.mtimeMs,
    }
  }

  /**
   * Replace an existing file's text.
   * @param expectedMtimeMs - the `mtimeMs` from the read this edit is based on.
   * @throws WorkspaceFilesError `conflict` when the file changed on disk since that read.
   */
  async write(worktree: string, file: string, content: string, expectedMtimeMs: number): Promise<FileSavedView> {
    const root = await this.options.resolveWorktree(worktree)
    const real = await confine(root, file)
    const info = await statFile(real)
    if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_BYTES) throw new WorkspaceFilesError('the text is too large to save here', 'too-large')
    if (info.mtimeMs !== expectedMtimeMs) {
      throw new WorkspaceFilesError('the file changed on disk since you opened it', 'conflict')
    }
    const temp = join(dirname(real), `.${basename(real)}.acryl-${randomBytes(6).toString('hex')}.tmp`)
    try {
      await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' })
      await chmod(temp, info.mode & 0o7777)
      await rename(temp, real)
    } catch {
      await unlink(temp).catch(() => {})
      throw new WorkspaceFilesError('the file could not be saved', 'failed')
    }
    const saved = await stat(real)
    return { path: root, file, size: saved.size, mtimeMs: saved.mtimeMs }
  }

  /**
   * Create, rename or delete one entry. Never overwrites, never recurses: a delete removes a file or an
   * empty folder only, and a create or rename refuses a name that is already taken.
   */
  async change(worktree: string, change: FileEntryChange): Promise<FileEntryChangedView> {
    const root = await this.options.resolveWorktree(worktree)
    if (change.op === 'create') {
      const target = await confineNew(root, change.file)
      try {
        if (change.kind === 'dir') await mkdir(target)
        else await writeFile(target, '', { flag: 'wx' })
      } catch {
        throw new WorkspaceFilesError('that could not be created', 'failed')
      }
      return { path: root, op: 'create', file: change.file }
    }
    if (change.op === 'rename') {
      const source = await confineEntry(root, change.file)
      const target = await confineNew(root, change.to)
      try {
        await rename(source, target)
      } catch {
        throw new WorkspaceFilesError('that could not be renamed', 'failed')
      }
      return { path: root, op: 'rename', file: change.to }
    }
    const target = await confineEntry(root, change.file)
    try {
      if ((await lstat(target)).isDirectory()) await rmdir(target)
      else await unlink(target)
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined
      if (code === 'ENOTEMPTY' || code === 'EEXIST') throw new WorkspaceFilesError('only an empty folder can be deleted', 'conflict')
      throw new WorkspaceFilesError('that could not be deleted', 'failed')
    }
    return { path: root, op: 'delete', file: null }
  }
}

async function statFile(real: string): Promise<{ size: number; mtimeMs: number; mode: number }> {
  try {
    const info = await stat(real)
    if (!info.isFile()) throw new Error('not a file')
    return { size: info.size, mtimeMs: info.mtimeMs, mode: info.mode }
  } catch {
    throw new WorkspaceFilesError('that file does not exist', 'not-found')
  }
}

/** A symlink is listed only when it points at a file or directory inside the worktree. */
async function symlinkKind(root: string, path: string): Promise<'file' | 'dir' | null> {
  try {
    const real = await realpath(path)
    if (!isInside(root, real)) return null
    const info = await stat(real)
    return info.isDirectory() ? 'dir' : info.isFile() ? 'file' : null
  } catch {
    return null
  }
}

function isInside(root: string, real: string): boolean {
  return real === root || real.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Turn a worktree-relative path into a real path that is guaranteed to be inside `root`.
 * Rejects absolute paths, NUL, `..` and `.git` segments, and symlinks that leave the worktree.
 */
export async function confine(root: string, relative: string): Promise<string> {
  if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0') || isAbsolute(relative)) {
    throw new WorkspaceFilesError('path must be relative to the worktree', 'invalid')
  }
  const segments = relative.split(/[\\/]+/).filter(segment => segment.length > 0)
  if (segments.length === 0 || segments.some(segment => segment === '..' || segment.toLowerCase() === '.git')) {
    throw new WorkspaceFilesError('that path is not allowed', 'invalid')
  }
  let real: string
  try {
    real = await realpath(join(root, ...segments))
  } catch {
    throw new WorkspaceFilesError('that path does not exist', 'not-found')
  }
  if (!isInside(root, real)) throw new WorkspaceFilesError('that path leaves the worktree', 'invalid')
  return real
}

function segmentsOf(relative: string): string[] {
  if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0') || isAbsolute(relative)) {
    throw new WorkspaceFilesError('path must be relative to the worktree', 'invalid')
  }
  const segments = relative.split(/[\\/]+/).filter(segment => segment.length > 0)
  if (segments.length === 0 || segments.some(segment => segment === '..' || segment === '.' || segment.toLowerCase() === '.git')) {
    throw new WorkspaceFilesError('that path is not allowed', 'invalid')
  }
  return segments
}

/**
 * The real path of an entry that will be created: its folder must exist inside the worktree and the name
 * must be free (a dangling symlink counts as taken).
 */
export async function confineNew(root: string, relative: string): Promise<string> {
  const segments = segmentsOf(relative)
  const name = segments[segments.length - 1] as string
  let parent: string
  try {
    parent = await realpath(join(root, ...segments.slice(0, -1)))
  } catch {
    throw new WorkspaceFilesError('the folder does not exist', 'not-found')
  }
  if (!isInside(root, parent)) throw new WorkspaceFilesError('that path leaves the worktree', 'invalid')
  const target = join(parent, name)
  try {
    await lstat(target)
  } catch {
    return target
  }
  throw new WorkspaceFilesError('something with that name already exists', 'conflict')
}

/** The path of an existing entry itself: a symlink is renamed or deleted as the link, never followed. */
async function confineEntry(root: string, relative: string): Promise<string> {
  const segments = segmentsOf(relative)
  const name = segments[segments.length - 1] as string
  let parent: string
  try {
    parent = await realpath(join(root, ...segments.slice(0, -1)))
  } catch {
    throw new WorkspaceFilesError('that path does not exist', 'not-found')
  }
  if (!isInside(root, parent)) throw new WorkspaceFilesError('that path leaves the worktree', 'invalid')
  const target = join(parent, name)
  try {
    await lstat(target)
  } catch {
    throw new WorkspaceFilesError('that path does not exist', 'not-found')
  }
  return target
}
