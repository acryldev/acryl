/**
 * Pre-image backups for repairs: every file a repair may change is copied first, so a repair can be undone
 * and an interrupted one can be rolled back.
 *
 * A backup is complete only when its manifest exists, and the manifest is written last and atomically, so a
 * repair killed halfway through making the backup leaves nothing that looks valid.
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { writeFileAtomic } from '../engine-files.ts'

const BACKUPS_DIR = 'repair-backups'
const MANIFEST = 'manifest.json'

export interface BackupEntry {
  readonly path: string
  /** False when the file did not exist, so undoing the repair removes it. */
  readonly existed: boolean
  /** The pre-image's name inside the backup directory. */
  readonly stored?: string
  readonly sha256?: string
}

export interface BackupManifest {
  readonly id: string
  readonly createdAt: string
  readonly profileName: string
  readonly recipes: readonly string[]
  readonly entries: readonly BackupEntry[]
}

const sha = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

/** A file a backup may touch must lie inside the engine home. */
function assertInside(dshHome: string, path: string): void {
  const rel = relative(resolve(dshHome), resolve(path))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`refusing to back up or restore a file outside the ACRYL home: ${path}`)
}

export const backupsDir = (dshHome: string): string => join(dshHome, BACKUPS_DIR)

/** Copy each file's current content aside. @returns the manifest of the new backup. */
export async function createBackup(input: {
  readonly dshHome: string
  readonly profileName: string
  readonly recipes: readonly string[]
  readonly files: readonly string[]
  readonly now?: () => Date
}): Promise<BackupManifest> {
  const now = (input.now ?? (() => new Date()))()
  const id = `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`
  const dir = join(backupsDir(input.dshHome), id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const entries: BackupEntry[] = []
  let index = 0
  for (const file of input.files) {
    assertInside(input.dshHome, file)
    if (!existsSync(file)) { entries.push({ path: file, existed: false }); continue }
    const data = readFileSync(file)
    const stored = `${String(index)}-${basename(file)}`
    index += 1
    await writeFileAtomic(join(dir, stored), data.toString('utf8'), { mode: 0o600, dirMode: 0o700 })
    entries.push({ path: file, existed: true, stored, sha256: sha(data) })
  }
  const manifest: BackupManifest = { id, createdAt: now.toISOString(), profileName: input.profileName, recipes: [...input.recipes], entries }
  // Last, so a backup that was interrupted before this point is not mistaken for a complete one.
  await writeFileAtomic(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  return manifest
}

/** Complete backups, newest first; incomplete or damaged ones are skipped. */
export function listBackups(dshHome: string): BackupManifest[] {
  let ids: string[]
  try {
    ids = readdirSync(backupsDir(dshHome))
  } catch {
    return []
  }
  const found: BackupManifest[] = []
  for (const id of ids) {
    try {
      const manifest = JSON.parse(readFileSync(join(backupsDir(dshHome), id, MANIFEST), 'utf8')) as BackupManifest
      if (manifest.id === id && Array.isArray(manifest.entries)) found.push(manifest)
    } catch {
      // No manifest, or an unreadable one: not a usable backup.
    }
  }
  return found.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)))
}

/** The pre-image bytes of one stored file, verified against its recorded hash. */
export function readPreImage(dshHome: string, manifest: BackupManifest, entry: BackupEntry): Buffer {
  if (entry.stored === undefined) throw new Error('that backup entry has no stored content')
  const data = readFileSync(join(backupsDir(dshHome), manifest.id, entry.stored))
  if (entry.sha256 !== undefined && sha(data) !== entry.sha256) throw new Error(`the backup of ${entry.path} is damaged (checksum mismatch)`)
  return data
}

/** Put every file back as it was: restore what existed, remove what the repair created. */
export async function restoreBackup(dshHome: string, id: string): Promise<BackupManifest> {
  const manifest = listBackups(dshHome).find(candidate => candidate.id === id)
  if (manifest === undefined) throw new Error(`no complete backup named ${id}`)
  // Verify everything first, so a damaged backup changes nothing.
  const restores = manifest.entries.map((entry) => {
    assertInside(dshHome, entry.path)
    return { entry, data: entry.existed ? readPreImage(dshHome, manifest, entry) : undefined }
  })
  for (const { entry, data } of restores) {
    if (data !== undefined) {
      mkdirSync(dirname(entry.path), { recursive: true })
      await writeFileAtomic(entry.path, data.toString('utf8'), { mode: 0o600, dirMode: 0o700 })
    } else if (existsSync(entry.path)) {
      rmSync(entry.path, { force: true })
    }
  }
  return manifest
}
