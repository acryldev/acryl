// Whether a snapshot (an app folder, or a registry entry, or a copy of either) is what its `blend.lock.json` says it is. The one check for everyone who takes an
// app from somewhere else: the framework's `snapshot apply`, `create --from` and the registry's own check.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { manifestDigest } from '../digest.js'
import { digestFolder } from './folder-digest.js'

const MANIFEST = 'blend.yaml'
const LOCK_FILE = 'blend.lock.json'
/** The plugin folders of an app: a lock may name nothing else, so a lock cannot point the check outside the app. */
const MODULE_SOURCE = /^(plugins|src\/plugins|extensions)\/[a-z0-9][a-z0-9._-]*$/u

export type SnapshotVerification = {
  readonly ok: boolean
  readonly problems: readonly string[]
  /** The manifest digest and each plugin folder checked. */
  readonly checked: number
}

type LockShape = {
  readonly formatVersion?: unknown
  readonly origin?: { readonly digest?: unknown }
  readonly modules?: ReadonlyArray<{ readonly name: string; readonly origin: string; readonly source?: string; readonly digest?: string }>
}

/** The digest a locked plugin folder has now, by its `source` in the lock; undefined when it is missing. */
export type LockedFolderDigest = (source: string) => string | undefined

/** What does not match, from the texts and the digests alone: the policy, with no disk. */
export function snapshotProblems(manifestText: string, lock: LockShape, folderDigest: LockedFolderDigest): SnapshotVerification {
  const problems: string[] = []
  if (lock.formatVersion !== 3) problems.push(`${LOCK_FILE} formatVersion ${String(lock.formatVersion)} is not 3`)
  let checked = 1
  if (lock.origin?.digest !== manifestDigest(manifestText)) problems.push(`${MANIFEST} changed since the lock was written (its digest no longer matches): capture again`)
  for (const module of lock.modules ?? []) {
    if (module.origin !== 'local') continue
    checked += 1
    if (module.source === undefined || !MODULE_SOURCE.test(module.source)) {
      problems.push(`${module.name}: the lock places it at ${String(module.source)}, which is not a plugin folder of the app`)
      continue
    }
    const digest = folderDigest(module.source)
    if (digest === undefined) problems.push(`${module.name}: ${module.source} is missing`)
    else if (`sha256:${digest}` !== module.digest) problems.push(`${module.name}: ${module.source} differs from the locked digest (edited after the capture)`)
  }
  return { ok: problems.length === 0, problems, checked }
}

/** Check the snapshot in a folder against its own `blend.lock.json`, offline. */
export function verifySnapshot(dir: string): SnapshotVerification {
  const manifestFile = join(dir, MANIFEST)
  const lockFile = join(dir, LOCK_FILE)
  if (!existsSync(manifestFile) || !existsSync(lockFile)) return { ok: false, problems: [`no ${MANIFEST} and ${LOCK_FILE} in ${dir}`], checked: 0 }
  let lock: LockShape
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8')) as LockShape
  } catch {
    return { ok: false, problems: [`${LOCK_FILE} is not valid JSON`], checked: 0 }
  }
  return snapshotProblems(readFileSync(manifestFile, 'utf8'), lock, (source) => {
    const folder = join(dir, source)
    return existsSync(folder) ? digestFolder(folder) : undefined
  })
}
