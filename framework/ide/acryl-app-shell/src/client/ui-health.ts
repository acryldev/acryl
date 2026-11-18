/**
 * The page's own health record: what froze it and what flooded it, kept so a freeze leaves evidence behind.
 *
 * Three detectors, each cheap enough to run always:
 * - **stall**: a heartbeat timer that fires late by more than `stallMs` means the main thread was blocked that long. Time while
 *   the page is hidden does not count: browsers throttle a hidden page's timers to once a second or less.
 * - **long task**: the browser's own `longtask` entries over `longTaskMs` (where `PerformanceObserver` supports them).
 * - **runaway**: the same console error more than `runawayCount` times within `runawayWindowMs` (10 s), the shape of a render loop
 *   (React's "Maximum update depth exceeded" once per store notification). A loop whose every turn costs a full failed render
 *   repeats only a few times a second while the page is frozen, so a one-second window missed it. The first occurrence's stack and the slot a crash named
 *   (`slot entry crashed in '<slot>'`) are kept, since a production build names no component.
 *
 * Each incident is kept in a bounded list (`window.__acrylHealth`) and written once as a `[acryl-health]` console warning, which
 * Desktop mirrors into its log file. Repeats of an ongoing runaway are counted on the incident, not written again.
 */

export type UiHealthIncident =
  | { readonly kind: 'stall'; readonly at: number; readonly ms: number }
  | { readonly kind: 'long-task'; readonly at: number; readonly ms: number }
  | { kind: 'runaway'; readonly at: number; readonly message: string; count: number; readonly stack?: string; readonly slot?: string }

export interface UiHealthOptions {
  readonly heartbeatMs?: number
  readonly stallMs?: number
  readonly longTaskMs?: number
  readonly runawayCount?: number
  /** The window the repeats of one error are counted in. */
  readonly runawayWindowMs?: number
  /** How long a runaway must be quiet before the same error opens a new incident. */
  readonly runawayQuietMs?: number
  readonly maxIncidents?: number
}

export interface UiHealthPorts {
  readonly now: () => number
  readonly setInterval: (callback: () => void, ms: number) => () => void
  /** The console whose `error` is observed (the original is always called) and whose `warn` reports incidents. */
  readonly console: Pick<Console, 'error' | 'warn'>
  /** Whether the page is visible now; a hidden page's timers are throttled, so its late beats are not stalls. */
  readonly isVisible?: () => boolean
  /** Subscribe to the browser's long tasks; absent where `PerformanceObserver` has no `longtask` entries. */
  readonly observeLongTasks?: (onTask: (durationMs: number) => void) => () => void
}

export interface UiHealthRecord {
  readonly incidents: readonly UiHealthIncident[]
}

const DEFAULTS = { heartbeatMs: 500, stallMs: 2_000, longTaskMs: 250, runawayCount: 20, runawayWindowMs: 10_000, runawayQuietMs: 5_000, maxIncidents: 50 }

/** The key a console error is counted under: its first argument as text (an Error as `name: message`), bounded. */
function messageOf(args: readonly unknown[]): string {
  const first = args[0]
  const text = first instanceof Error ? `${first.name}: ${first.message}` : String(first)
  return text.slice(0, 300)
}

function stackOf(args: readonly unknown[]): string | undefined {
  const error = args.find((arg): arg is Error => arg instanceof Error)
  return error?.stack?.split('\n').slice(0, 12).join('\n')
}

/** @returns the record and a disposer that restores the console and stops the detectors. */
export function startUiHealth(ports: UiHealthPorts, options: UiHealthOptions = {}): { readonly record: UiHealthRecord; readonly stop: () => void } {
  const settings = { ...DEFAULTS, ...options }
  const incidents: UiHealthIncident[] = []
  const add = (incident: UiHealthIncident): void => {
    incidents.push(incident)
    if (incidents.length > settings.maxIncidents) incidents.shift()
    report(incident)
  }
  const originalWarn = ports.console.warn.bind(ports.console)
  const report = (incident: UiHealthIncident): void => {
    originalWarn(`[acryl-health] ${JSON.stringify(incident)}`)
  }

  let lastBeat = ports.now()
  const stopHeartbeat = ports.setInterval(() => {
    const at = ports.now()
    const late = at - lastBeat - settings.heartbeatMs
    lastBeat = at
    if (late > settings.stallMs && (ports.isVisible?.() ?? true)) add({ kind: 'stall', at, ms: Math.round(late) })
  }, settings.heartbeatMs)

  const stopLongTasks = ports.observeLongTasks?.((durationMs) => {
    if (durationMs > settings.longTaskMs) add({ kind: 'long-task', at: ports.now(), ms: Math.round(durationMs) })
  })

  // Counts of each console error per window; a crossing of the threshold opens a runaway incident, later repeats count on it.
  let windowStart = ports.now()
  let counts = new Map<string, { count: number; stack?: string }>()
  const open = new Map<string, Extract<UiHealthIncident, { kind: 'runaway' }>>()
  const lastSeen = new Map<string, number>()
  let lastSlot: string | undefined
  const originalError = ports.console.error
  const observedError = (...args: unknown[]): void => {
    originalError.apply(ports.console, args)
    const at = ports.now()
    if (at - windowStart >= settings.runawayWindowMs) {
      windowStart = at
      counts = new Map()
    }
    // A runaway quiet for `runawayQuietMs` is over; the same error later opens (and reports) a new incident.
    for (const [key, seenAt] of lastSeen) if (at - seenAt >= settings.runawayQuietMs) { open.delete(key); lastSeen.delete(key) }
    const message = messageOf(args)
    const slot = /slot entry crashed in '([^']+)'/u.exec(message)?.[1]
    if (slot !== undefined) lastSlot = slot
    const ongoing = open.get(message)
    if (ongoing !== undefined) { ongoing.count += 1; lastSeen.set(message, at); return }
    const seen = counts.get(message) ?? { count: 0 }
    seen.count += 1
    const stack = seen.stack ?? stackOf(args)
    if (stack !== undefined) seen.stack = stack
    counts.set(message, seen)
    if (seen.count <= settings.runawayCount) return
    const incident: Extract<UiHealthIncident, { kind: 'runaway' }> = {
      kind: 'runaway', at, message, count: seen.count,
      ...seen.stack === undefined ? {} : { stack: seen.stack },
      ...lastSlot === undefined ? {} : { slot: lastSlot },
    }
    open.set(message, incident)
    lastSeen.set(message, at)
    add(incident)
  }
  ports.console.error = observedError

  return {
    record: { incidents },
    stop: () => {
      stopHeartbeat()
      stopLongTasks?.()
      if (ports.console.error === observedError) ports.console.error = originalError
    },
  }
}

/** The browser's long tasks, where supported. */
export function browserLongTasks(onTask: (durationMs: number) => void): (() => void) | undefined {
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return undefined
  const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) onTask(entry.duration) })
  observer.observe({ type: 'longtask', buffered: false })
  return () => { observer.disconnect() }
}
