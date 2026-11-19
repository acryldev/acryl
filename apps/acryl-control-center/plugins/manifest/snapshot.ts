/**
 * The snapshot verbs: an app folder is its own Blend (`blend.yaml` + `plugins/` + `blend.lock.json`), and these keep it one that can be passed on.
 * Ported from ACRYL's Extension Context Pack (`plugins/acryl-plugin-context/lib/blend-capture.js` `captureApp`/`verifyBlend` and
 * `lib/blend-apply.js` `applyBlend`), for an app whose plugins are folders rather than packages installed into a DSH profile.
 *
 * - `captureApp` records the app as it runs: every plugin folder of its own gets a row in `blend.yaml` if it has none yet (a live install becomes
 *   part of the composition), the person's text and comments are kept, and `blend.lock.json` is written again (lock.ts).
 * - `verifyApp` checks a snapshot against its own lock, offline: `blend.yaml` still has the digest the lock recorded, and every plugin folder the
 *   lock names still hashes to its digest.
 * - `applySnapshot` brings a snapshot into an app: it verifies the snapshot first, refuses the whole apply when a plugin folder of the same name
 *   in the app differs from the locked one (somebody's work is never overwritten), then copies the missing folders, writes the snapshot's
 *   `blend.yaml` under the app's own `metadata` (its rows come in, its identity stays the app's) and locks
 *   the app again. A running app reloads from the change. A plugin folder the snapshot does not have is left where it is, put on the
 *   `extensions` row's `off` list so it does not start, and reported.
 *
 * Not ported: ACRYL's registry and pulled modules (an app's lock records local folders only) and its evolution ledger (an app's history is its git
 * versions).
 *
 *   node plugins/manifest/snapshot.ts capture | verify [dir] | apply <snapshot dir>
 */
import { cpSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestFolder, FOLDER_DIGEST_SKIPPED, manifestDigest } from '@webboxes/blends-core'
import { isSeq, parseDocument } from 'yaml'
import { appPluginNames } from './app-plugins.ts'
import { LOCK_FILE, writeLock } from './lock.ts'

const MANIFEST = 'blend.yaml'
/** Where a lock may place a plugin folder: one level inside the app's plugin folders, never outside the app. */
const MODULE_SOURCE = /^(plugins|src\/plugins|extensions)\/[a-z0-9][a-z0-9._-]*$/

interface LockedModule {
  readonly name: string
  readonly origin: string
  readonly digest?: string
  readonly source?: string
}

interface LockShape {
  readonly formatVersion?: unknown
  readonly origin?: { readonly digest?: unknown }
  readonly modules?: readonly LockedModule[]
}

export interface CaptureResult {
  /** The rows added to `blend.yaml`, one per plugin folder that had none. */
  readonly addedRows: readonly string[]
  /** How many plugin folders the lock records. */
  readonly modules: number
}

export interface VerifyResult {
  readonly ok: boolean
  readonly problems: readonly string[]
  /** The manifest digest and each plugin folder checked. */
  readonly checked: number
}

export type ApplyStatus = 'added' | 'unchanged' | 'conflict' | 'skipped'

export interface ApplyResult {
  readonly ok: boolean
  /** Why nothing was applied: the snapshot does not match its lock, or a folder in the app differs from the locked one. */
  readonly problems: readonly string[]
  readonly modules: ReadonlyArray<{
    readonly name: string
    readonly status: ApplyStatus
    readonly detail?: string
  }>
  readonly manifestChanged: boolean
  /** The app's own plugin folders the snapshot does not have: left in place, and put on the `extensions` row's `off` list so they do not start. */
  readonly extra: readonly string[]
}

/** Replace a file in one step: a reader sees the old text or the new, never half of it. */
function writeAtomic(file: string, text: string): void {
  writeFileSync(`${file}.tmp`, text)
  renameSync(`${file}.tmp`, file)
}

const folderDigest = (dir: string): string => `sha256:${digestFolder(dir)}`

/** The plugin names `blend.yaml`'s rows mount (`name`, the folder a row loads). */
function rowNames(text: string): Set<string> {
  const rows = parseDocument(text).toJS()?.spec?.rows
  return new Set(
    Array.isArray(rows) ? rows.map((row: { name?: unknown }) => String(row?.name)) : [],
  )
}

/**
 * Record the app as it runs: a row for every plugin folder of its own that has none (before the `extensions` row, else before the server, else
 * last), then `blend.lock.json`. Idempotent: a second capture with nothing new changes nothing in `blend.yaml`.
 */
export function captureApp(appRoot: string): CaptureResult {
  const file = join(appRoot, MANIFEST)
  const text = readFileSync(file, 'utf8')
  const named = rowNames(text)
  const missing = appPluginNames(join(appRoot, 'plugins')).filter((name) => !named.has(name))
  if (missing.length > 0) {
    const document = parseDocument(text)
    const rows = document.getIn(['spec', 'rows'])
    if (!isSeq(rows)) throw new Error(`${file} has no spec.rows list; it is not an app definition`)
    const names = rows.items.map((row) =>
      String((row as { get?: (key: string) => unknown }).get?.('name')),
    )
    const before =
      names.indexOf('extensions') >= 0
        ? names.indexOf('extensions')
        : names.indexOf('acryl-node-server')
    const at = before >= 0 ? before : rows.items.length
    rows.items.splice(at, 0, ...missing.map((name) => document.createNode({ id: name, name })))
    writeAtomic(file, String(document))
  }
  const lock = writeLock(appRoot)
  return { addedRows: missing, modules: lock.modules.length }
}

/** Check a snapshot (an app folder, or a copy of one) against its own `blend.lock.json`. */
export function verifyApp(dir: string): VerifyResult {
  const manifestFile = join(dir, MANIFEST)
  const lockFile = join(dir, LOCK_FILE)
  if (!existsSync(manifestFile) || !existsSync(lockFile))
    return { ok: false, problems: [`no ${MANIFEST} and ${LOCK_FILE} in ${dir}`], checked: 0 }
  let lock: LockShape
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8')) as LockShape
  } catch {
    return { ok: false, problems: [`${LOCK_FILE} is not valid JSON`], checked: 0 }
  }
  const problems: string[] = []
  if (lock.formatVersion !== 3)
    problems.push(`${LOCK_FILE} formatVersion ${String(lock.formatVersion)} is not 3`)
  let checked = 1
  if (lock.origin?.digest !== manifestDigest(readFileSync(manifestFile, 'utf8')))
    problems.push(
      `${MANIFEST} changed since the lock was written (its digest no longer matches): capture again`,
    )
  for (const module of lock.modules ?? []) {
    if (module.origin !== 'local') continue
    checked += 1
    if (module.source === undefined || !MODULE_SOURCE.test(module.source)) {
      problems.push(
        `${module.name}: the lock places it at ${String(module.source)}, which is not a plugin folder of the app`,
      )
      continue
    }
    const folder = join(dir, module.source)
    if (!existsSync(folder)) problems.push(`${module.name}: ${module.source} is missing`)
    else if (folderDigest(folder) !== module.digest)
      problems.push(
        `${module.name}: ${module.source} differs from the locked digest (edited after the capture)`,
      )
  }
  return { ok: problems.length === 0, problems, checked }
}

/**
 * The snapshot's `blend.yaml` with the app's own `metadata` (its id, name, version and visibility): a snapshot brings its composition, and the app
 * it is applied to stays the app it is. An app with no `blend.yaml` yet takes the snapshot's whole.
 */
function keepIdentity(text: string, current: string | undefined): string {
  if (current === undefined) return text
  const own = parseDocument(current).get('metadata', true)
  if (own === undefined) return text
  const document = parseDocument(text)
  document.set('metadata', own)
  return String(document)
}

/**
 * `blend.yaml` with `names` on the `extensions` row's `off` list: the row starts every plugin folder that has no row of its own, and a folder the
 * snapshot does not have must stay where it is without starting. Without an `extensions` row no such folder starts, and the text is unchanged.
 */
function keepOff(text: string, names: readonly string[]): string {
  if (names.length === 0) return text
  const document = parseDocument(text)
  const rows = document.getIn(['spec', 'rows'])
  if (!isSeq(rows)) return text
  const row = rows.items.find(
    (item) => (item as { get?: (key: string) => unknown }).get?.('name') === 'extensions',
  ) as { getIn(path: string[]): unknown; setIn(path: string[], value: unknown): void } | undefined
  if (row === undefined) return text
  const listed = row.getIn(['config', 'off']) as { toJSON?: () => unknown } | undefined
  const before = Array.isArray(listed?.toJSON?.()) ? (listed?.toJSON?.() as string[]) : []
  row.setIn(['config', 'off'], document.createNode([...new Set([...before, ...names])].sort()))
  return String(document)
}

/** Bring the snapshot in `from` into the app at `appRoot` (see the file's doc). Nothing is written unless the whole apply can go through. */
export function applySnapshot(from: string, appRoot: string): ApplyResult {
  const verified = verifyApp(from)
  const none = { modules: [], manifestChanged: false, extra: [] }
  if (!verified.ok) return { ok: false, problems: verified.problems, ...none }
  const lock = JSON.parse(readFileSync(join(from, LOCK_FILE), 'utf8')) as LockShape
  const modules: Array<{ name: string; status: ApplyStatus; detail?: string; source?: string }> = []
  for (const module of lock.modules ?? []) {
    if (module.origin !== 'local' || module.source === undefined) {
      modules.push({
        name: module.name,
        status: 'skipped',
        detail: `origin "${module.origin}" is not a plugin folder; add it yourself`,
      })
      continue
    }
    const target = join(appRoot, module.source)
    if (!existsSync(target))
      modules.push({ name: module.name, status: 'added', source: module.source })
    else if (folderDigest(target) === module.digest)
      modules.push({ name: module.name, status: 'unchanged' })
    else
      modules.push({
        name: module.name,
        status: 'conflict',
        detail: `${module.source} in the app differs from the snapshot's; move it away or capture the app first`,
      })
  }
  const conflicts = modules.filter((module) => module.status === 'conflict')
  const report = modules.map(({ source: _, ...module }) => module)
  if (conflicts.length > 0)
    return {
      ok: false,
      problems: conflicts.map((module) => `${module.name}: ${module.detail}`),
      modules: report,
      manifestChanged: false,
      extra: [],
    }
  for (const module of modules)
    if (module.status === 'added' && module.source !== undefined)
      cpSync(join(from, module.source), join(appRoot, module.source), {
        recursive: true,
        filter: (path) => !FOLDER_DIGEST_SKIPPED.has(basename(path)),
      })
  const locked = new Set((lock.modules ?? []).map((module) => module.name))
  const extra = appPluginNames(join(appRoot, 'plugins')).filter((name) => !locked.has(name))
  const current = existsSync(join(appRoot, MANIFEST))
    ? readFileSync(join(appRoot, MANIFEST), 'utf8')
    : undefined
  const manifest = keepOff(keepIdentity(readFileSync(join(from, MANIFEST), 'utf8'), current), extra)
  const manifestChanged = current !== manifest
  if (manifestChanged) writeAtomic(join(appRoot, MANIFEST), manifest)
  writeLock(appRoot)
  return { ok: true, problems: [], modules: report, manifestChanged, extra }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const [verb, target] = process.argv.slice(2)
  if (verb === 'capture') {
    const { addedRows, modules } = captureApp(appRoot)
    console.log(
      `captured: ${modules} plugin folder(s) locked${addedRows.length > 0 ? `; rows added to blend.yaml: ${addedRows.join(', ')}` : ''}`,
    )
  } else if (verb === 'verify') {
    const result = verifyApp(resolve(target ?? appRoot))
    console.log(result.ok ? `ok: ${result.checked} checked` : result.problems.join('\n'))
    process.exitCode = result.ok ? 0 : 1
  } else if (verb === 'apply' && target !== undefined) {
    const result = applySnapshot(resolve(target), appRoot)
    for (const module of result.modules)
      console.log(`${module.status}: ${module.name}${module.detail ? ` (${module.detail})` : ''}`)
    if (result.manifestChanged)
      console.log("blend.yaml: the snapshot's rows, under this app's own metadata")
    if (result.extra.length > 0)
      console.log(`left in place, not in the snapshot: ${result.extra.join(', ')}`)
    if (!result.ok) console.error(`nothing applied:\n${result.problems.join('\n')}`)
    process.exitCode = result.ok ? 0 : 1
  } else {
    console.error(
      'usage: node plugins/manifest/snapshot.ts capture | verify [dir] | apply <snapshot dir>',
    )
    process.exitCode = 2
  }
}
