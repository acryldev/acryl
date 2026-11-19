/**
 * Keep a profile's recorded pnpm layout authoritative before any pnpm operation.
 *
 * A profile's `node_modules/.modules.yaml` records the `nodeLinker` and
 * `publicHoistPattern` its dependencies were installed with. The profile's
 * `pnpm-workspace.yaml` may say something else (a profile created by pnpm 9
 * ignored `nodeLinker: hoisted`; pnpm >= 10 honors it). When they differ, pnpm
 * silently relinks the whole tree - measured: a hoisted relink exposed stale
 * top-level `@deepseek-ai/*` packages that shadowed the harness's and stopped
 * the app from starting. Pinning the recorded values into the workspace file
 * makes every pnpm (pinned 11.x, or whatever is on PATH) keep the layout that
 * is already on disk. Only a deliberate, human-run reinstall changes layout.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMap, parse, parseDocument } from 'yaml'

const NODE_LINKERS = ['isolated', 'hoisted', 'pnp'] as const
type NodeLinker = (typeof NODE_LINKERS)[number]

/** Which profile a pnpm service operates on. */
export interface PnpmProfileConfig {
  readonly name: string
  readonly dir: string
}

/** What a reconcile changed; empty when the workspace file already agreed. */
export interface LayoutChange {
  readonly key: 'nodeLinker' | 'publicHoistPattern'
  readonly from: unknown
  readonly to: unknown
}

interface RecordedLayout {
  readonly nodeLinker?: NodeLinker
  readonly publicHoistPattern?: readonly string[]
}

function readRecorded(modulesFile: string): RecordedLayout {
  let raw: unknown
  try { raw = parse(readFileSync(modulesFile, 'utf8')) } catch { return {} }
  if (raw === null || typeof raw !== 'object') return {}
  const record = raw as Record<string, unknown>
  const linker = NODE_LINKERS.find(value => value === record['nodeLinker'])
  const pattern = record['publicHoistPattern']
  return {
    ...(linker === undefined ? {} : { nodeLinker: linker }),
    ...(Array.isArray(pattern) && pattern.every(item => typeof item === 'string') ? { publicHoistPattern: pattern as string[] } : {}),
  }
}

const sameList = (a: unknown, b: readonly string[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index])

/**
 * Pin the recorded `nodeLinker` / `publicHoistPattern` into the profile's `pnpm-workspace.yaml`.
 * A profile with no installed `node_modules` (or no workspace file) has no layout to protect and is left alone.
 * @returns the changes made (empty when nothing needed pinning)
 */
export function reconcileProfileLayout(profileDir: string): LayoutChange[] {
  const modulesFile = join(profileDir, 'node_modules', '.modules.yaml')
  const workspaceFile = join(profileDir, 'pnpm-workspace.yaml')
  if (!existsSync(modulesFile) || !existsSync(workspaceFile)) return []
  const recorded = readRecorded(modulesFile)
  const document = parseDocument(readFileSync(workspaceFile, 'utf8'))
  if (!isMap(document.contents)) return []

  const changes: LayoutChange[] = []
  if (recorded.nodeLinker !== undefined) {
    const declared: unknown = document.get('nodeLinker') ?? 'isolated'
    if (declared !== recorded.nodeLinker) {
      changes.push({ key: 'nodeLinker', from: declared, to: recorded.nodeLinker })
      document.set('nodeLinker', recorded.nodeLinker)
    }
  }
  if (recorded.publicHoistPattern !== undefined) {
    const declared: unknown = document.get('publicHoistPattern')
    // Absent means "pnpm's own default", which differs across majors (9: eslint/prettier, 12: empty).
    if (!sameList(isMapValue(declared), recorded.publicHoistPattern)) {
      changes.push({ key: 'publicHoistPattern', from: isMapValue(declared), to: recorded.publicHoistPattern })
      document.set('publicHoistPattern', recorded.publicHoistPattern)
    }
  }
  if (changes.length === 0) return []
  const temp = `${workspaceFile}.acryl-tmp`
  writeFileSync(temp, document.toString())
  renameSync(temp, workspaceFile)
  return changes
}

/** `document.get` returns a YAML node wrapper for collections; unwrap to plain JSON. */
function isMapValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') {
    return (value as { toJSON(): unknown }).toJSON()
  }
  return value
}
