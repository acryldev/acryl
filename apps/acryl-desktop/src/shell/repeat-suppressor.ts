/**
 * Collapse a flood of identical log lines. A runaway render loop in the renderer repeats the same console error on every store
 * update (React's "Maximum update depth exceeded", once per notification); mirroring each one to the main process's log made the
 * logging itself part of the freeze. The first occurrence of a line is written at once; repeats inside the window are counted and
 * written as one "repeated N times" line when the window ends or a different line arrives.
 */

export interface RepeatSuppressorOptions {
  /** How long identical lines are folded into one summary. */
  readonly windowMs: number
  readonly write: (line: string) => void
  readonly now?: () => number
  /** Schedules the flush of a pending summary; returns a canceller. */
  readonly schedule?: (callback: () => void, delayMs: number) => () => void
}

export interface RepeatSuppressor {
  log(line: string): void
  /** Write any pending summary now (on shutdown). */
  flush(): void
}

export function createRepeatSuppressor(options: RepeatSuppressorOptions): RepeatSuppressor {
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? ((callback, delayMs) => {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return () => { clearTimeout(timer) }
  })
  let last: { line: string; since: number; repeats: number; cancel: (() => void) | undefined } | undefined

  const flush = (): void => {
    const current = last
    if (current === undefined) return
    current.cancel?.()
    if (current.repeats > 0) options.write(`${current.line} [repeated ${String(current.repeats)} more times in ${String(Math.max(1, Math.round((now() - current.since) / 1000)))}s]`)
    last = undefined
  }

  return {
    log(line) {
      if (last !== undefined && last.line === line && now() - last.since < options.windowMs) {
        last.repeats += 1
        last.cancel ??= schedule(flush, Math.max(0, options.windowMs - (now() - last.since)))
        return
      }
      flush()
      options.write(line)
      last = { line, since: now(), repeats: 0, cancel: undefined }
    },
    flush,
  }
}
