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

/** The host's output, one file a day (`host-YYYY-MM-DD.log`) in the app's logs folder; files older than two weeks go. Never throws: a log must not stop the app. */
export function appendHostLog(dir: string, text: string, now: Date = new Date()): void {
  try {
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `host-${now.toISOString().slice(0, 10)}.log`), text)
    for (const name of readdirSync(dir)) {
      if (!/^host-\d{4}-\d{2}-\d{2}\.log$/u.test(name)) continue
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
