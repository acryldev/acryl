/**
 * What the window does when its frame host stops by itself (found on an installed app 2026-11-09: the host had ended days before, nothing restarted it, and
 * the window kept asking a closed port, a thousand errors and a dead page). Two small rules, both pure of Electron so they are tested without a window:
 * when to start the host again, and where its output is kept so the next stop has a cause on disk.
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface RestartPolicy {
  /** Stops inside `windowMs` that are forgiven; one more and the host is not started again by itself. */
  readonly maxInWindow: number
  readonly windowMs: number
  /** The wait before the n-th restart inside the window: short first, then longer. */
  readonly delaysMs: readonly number[]
}

export const RESTART_POLICY: RestartPolicy = Object.freeze({
  maxInWindow: 4,
  windowMs: 120_000,
  delaysMs: [500, 2_000, 5_000, 10_000],
})

export type RestartDecision = { restart: true; delayMs: number } | { restart: false }

/** `stops` are the times (ms) the host stopped by itself, oldest or newest first; those older than the window are forgotten. */
export function nextRestart(
  stops: readonly number[],
  now: number,
  policy: RestartPolicy = RESTART_POLICY,
): RestartDecision {
  const recent = stops.filter((at) => now - at < policy.windowMs).length
  if (recent >= policy.maxInWindow) return { restart: false }
  return {
    restart: true,
    delayMs: policy.delaysMs[Math.min(recent, policy.delaysMs.length - 1)] ?? 0,
  }
}

const KEEP_DAYS = 14

/**
 * The host's output, one file a day (`host-YYYY-MM-DD.log`) in the app's logs folder; files older than two weeks go. Never throws: a log must not stop the app.
 * `prefix` names another log of the same kind (the window's own start, `desktop-YYYY-MM-DD.log`).
 */
export function appendHostLog(
  dir: string,
  text: string,
  now: Date = new Date(),
  prefix: 'host' | 'desktop' = 'host',
): void {
  try {
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `${prefix}-${now.toISOString().slice(0, 10)}.log`), text)
    const own = new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.log$`, 'u')
    for (const name of readdirSync(dir)) {
      if (!own.test(name)) continue
      const file = join(dir, name)
      if (now.getTime() - statSync(file).mtimeMs > KEEP_DAYS * 86_400_000)
        rmSync(file, { force: true })
    }
  } catch {
    // The disk is full or the folder is gone: the host goes on.
  }
}

/**
 * `node --watch` does not end when the host it runs crashes: it prints this line and waits for a saved file (reproduced on a packed app by killing the host's
 * child: the watcher stayed, the port was closed, nothing answered and nothing restarted). So the window reads the line as the host's death.
 */
export function hostCrashed(output: string): boolean {
  return /Failed running '/u.test(output)
}

/**
 * Whether the watcher ended or restarted the host (a saved file, or the product copying its new source in on the first start after an update): the
 * host that comes back is a new process with a new process token, so a page signed in to the old one gets 401 and 404 until it loads again.
 */
export function hostRestarting(output: string): boolean {
  return /Completed running '|Restarting '/u.test(output)
}
