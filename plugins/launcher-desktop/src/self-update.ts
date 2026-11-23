/**
 * The Control Center updating itself: the Blend copy it runs from (`~/.acryl/control-center`, made by `acryl --gui` from the registry) is brought to its Blend's
 * newer release with the same `acrylblends update` the launcher runs for any app (a git merge that keeps local changes, then npm install).
 *
 * The update changes this app's own plugins while it runs, and the frame reloads them in place, so the service that started it may be gone before it ends.
 * So it runs detached, writes its output to `<home>/logs/control-center-update.log` and its exit code to `...update.end`, and its start to `...update.json`:
 * any later service reads where it is from those files, not from memory.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SelfView } from './contract.ts'

/** The command that updates an app from its Blend's newer release (as the service's `update`). */
export const SELF_UPDATE_SPEC = 'acrylblends@latest'

export interface SelfFiles {
  readonly read: (path: string) => string | undefined
  readonly write: (path: string, text: string) => void
  readonly remove: (path: string) => void
  /** When a file was last written (ms since epoch), or undefined when it is not there. */
  readonly modified: (path: string) => number | undefined
}

/** The copy this app runs from: its folder, the name a person reads, and the Blend and version it was made from. */
export interface SelfCopy {
  readonly folder: string
  readonly name: string
  readonly blend: string
  readonly version: string
}

const paths = (home: string) => {
  const folder = join(home, 'logs')
  return { folder, start: join(folder, 'control-center-update.json'), end: join(folder, 'control-center-update.end'), log: join(folder, 'control-center-update.log') }
}

/** The Blend and version a copy was made from: package.json's `acryl.from` (`acryl.control-center#0.2.14`), which create-acrylblends writes. */
export function originOf(packageText: string | undefined): { blend: string, version: string } | undefined {
  if (packageText === undefined) return undefined
  try {
    const from = (JSON.parse(packageText) as { acryl?: { from?: unknown } }).acryl?.from
    const match = typeof from === 'string' ? /^([a-z0-9][a-z0-9._-]*)#(\d+\.\d+\.\d+\S*)$/u.exec(from) : null
    return match === null ? undefined : { blend: match[1]!, version: match[2]! }
  } catch {
    return undefined
  }
}

/** The last lines of a log, the way the screen shows a job's output. */
const lastLines = (text: string | undefined, count = 12): string => (text ?? '').replaceAll(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '').trimEnd().split(/\r?\n/u).slice(-count).join('\n')

/**
 * Where the copy stands: up to date (`undefined` when there is nothing to say), a newer release out, an update running, done (until this app is opened
 * again: `startedAt` is when this process began), or failed. `version` is what the copy has now (blend.yaml's `metadata.version`, which the merge moves).
 */
export function selfView(copy: SelfCopy, latest: string | undefined, files: SelfFiles, home: string, startedAt: number, newer: (a: string, b: string) => boolean): SelfView | undefined {
  const at = paths(home)
  const started = files.read(at.start)
  if (started !== undefined) {
    let record: { to?: unknown, since?: unknown } = {}
    try { record = JSON.parse(started) as typeof record } catch { /* a broken record reads as an update to an unknown version */ }
    const to = typeof record.to === 'string' ? record.to : '?'
    const since = typeof record.since === 'number' ? record.since : 0
    const ended = files.read(at.end)
    if (ended === undefined) return { name: copy.name, version: copy.version, update: to, status: 'updating', since, output: lastLines(files.read(at.log)) }
    // Done before this app was opened: the new release is what runs now; the record is cleared.
    if (ended.trim() === '0' && (files.modified(at.end) ?? 0) < startedAt) { for (const file of [at.start, at.end]) files.remove(file) }
    else if (ended.trim() === '0') return { name: copy.name, version: copy.version, update: to, status: 'done', since }
    else return { name: copy.name, version: copy.version, update: to, status: 'failed', since, output: lastLines(files.read(at.log)) }
  }
  return latest !== undefined && newer(latest, copy.version) ? { name: copy.name, version: copy.version, update: latest, status: 'available' } : undefined
}

/**
 * The command that updates the copy, detached (its output goes to a file, so it outlives the service and this app's reload): node runs
 * `npm exec acrylblends@latest -- update` in the copy and writes its exit code to the end file. Records the start first.
 */
export function selfUpdateCommand(copy: SelfCopy, to: string, files: SelfFiles & { makeFolder: (path: string) => void }, home: string, now: number): { program: string, args: string[], cwd: string, log: string } {
  const at = paths(home)
  files.makeFolder(at.folder)
  files.remove(at.end)
  files.write(at.start, `${JSON.stringify({ from: copy.version, to, since: now })}\n`)
  const script = [
    "const { spawnSync } = require('node:child_process')",
    "const { writeFileSync } = require('node:fs')",
    "const win = process.platform === 'win32'",
    `const run = spawnSync(win ? 'npm.cmd' : 'npm', ['exec', '--yes', '${SELF_UPDATE_SPEC}', '--', 'update'], { stdio: 'inherit', shell: win })`,
    "writeFileSync(process.argv[1], String(run.status ?? 1))",
  ].join('; ')
  return { program: 'node', args: ['-e', script, at.end], cwd: copy.folder, log: at.log }
}

/** The record's files on this machine's disk. */
export const nodeSelfFiles: SelfFiles & { makeFolder: (path: string) => void } = {
  read: (path) => { try { return readFileSync(path, 'utf8') } catch { return undefined } },
  write: (path, text) => { writeFileSync(path, text) },
  remove: (path) => { rmSync(path, { force: true }) },
  modified: (path) => (existsSync(path) ? statSync(path).mtimeMs : undefined),
  makeFolder: (path) => { mkdirSync(path, { recursive: true }) },
}
