/**
 * `npm run desktop` while `npm run dev` runs: the door allows one process per app folder, so a second server cannot start. Instead of failing, the window attaches to the dev server
 * that is running, and its door (the same pages, the same agent, the same data); closing the window then leaves that server running.
 *
 * The running server is found where the door says it is: `.acryl/door.json` (its loopback address and pid). Only a live process on a loopback address that answers is attached to.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RunningApp {
  readonly url: string
  readonly pid: number
}

export interface AttachDeps {
  readonly read?: (file: string) => string
  /** True when a process with this pid is alive. */
  readonly alive?: (pid: number) => boolean
  /** Whether something answers HTTP at the address. */
  readonly answers?: (url: string) => Promise<boolean>
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const httpAnswers = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'manual' })
    return true
  } catch {
    return false
  }
}

/** @returns the dev server running from `root`, or `undefined` when there is none (no door file, a dead process, a stranger's address, nothing answering). */
export async function runningApp(
  root: string,
  deps: AttachDeps = {},
): Promise<RunningApp | undefined> {
  const read = deps.read ?? ((file: string) => readFileSync(file, 'utf8'))
  let found: { url?: unknown; pid?: unknown }
  try {
    found = JSON.parse(read(join(root, '.acryl', 'door.json'))) as { url?: unknown; pid?: unknown }
  } catch {
    return undefined
  }
  if (
    typeof found.url !== 'string' ||
    typeof found.pid !== 'number' ||
    !Number.isInteger(found.pid) ||
    found.pid <= 0
  )
    return undefined
  let parsed: URL
  try {
    parsed = new URL(found.url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' || !LOOPBACK.has(parsed.hostname)) return undefined
  if (!(deps.alive ?? processAlive)(found.pid)) return undefined
  if (!(await (deps.answers ?? httpAnswers)(parsed.origin))) return undefined
  return { url: parsed.origin, pid: found.pid }
}
