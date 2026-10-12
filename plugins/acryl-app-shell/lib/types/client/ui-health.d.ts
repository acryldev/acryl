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
export type UiHealthIncident = {
    readonly kind: 'stall';
    readonly at: number;
    readonly ms: number;
} | {
    readonly kind: 'long-task';
    readonly at: number;
    readonly ms: number;
} | {
    kind: 'runaway';
    readonly at: number;
    readonly message: string;
    count: number;
    readonly stack?: string;
    readonly slot?: string;
};
export interface UiHealthOptions {
    readonly heartbeatMs?: number;
    readonly stallMs?: number;
    readonly longTaskMs?: number;
    readonly runawayCount?: number;
    /** The window the repeats of one error are counted in. */
    readonly runawayWindowMs?: number;
    /** How long a runaway must be quiet before the same error opens a new incident. */
    readonly runawayQuietMs?: number;
    readonly maxIncidents?: number;
}
export interface UiHealthPorts {
    readonly now: () => number;
    readonly setInterval: (callback: () => void, ms: number) => () => void;
    /** The console whose `error` is observed (the original is always called) and whose `warn` reports incidents. */
    readonly console: Pick<Console, 'error' | 'warn'>;
    /** Whether the page is visible now; a hidden page's timers are throttled, so its late beats are not stalls. */
    readonly isVisible?: () => boolean;
    /** Subscribe to the browser's long tasks; absent where `PerformanceObserver` has no `longtask` entries. */
    readonly observeLongTasks?: (onTask: (durationMs: number) => void) => () => void;
}
export interface UiHealthRecord {
    readonly incidents: readonly UiHealthIncident[];
}
/** @returns the record and a disposer that restores the console and stops the detectors. */
export declare function startUiHealth(ports: UiHealthPorts, options?: UiHealthOptions): {
    readonly record: UiHealthRecord;
    readonly stop: () => void;
};
/** The browser's long tasks, where supported. */
export declare function browserLongTasks(onTask: (durationMs: number) => void): (() => void) | undefined;
