/**
 * The terminal dock's layout preferences: where the terminal panel sits and how big it is. The panel is always
 * visible (owner decision 2026-09-28: PTYs stay reachable, only their layout changes) - pure rules (parsing what
 * was saved, clamping sizes, the cycle of modes) with no page and no storage in them.
 *
 * Three modes, as in the Super Engineering screens the owner pointed to (spec 040 T126):
 * - `stacked`: the right pane keeps its full height; the terminal panel sits under Files, Changes, Review, Checks.
 * - `bottom`: the right pane keeps the full height; the terminal panel sits under the main chat or canvas.
 * - `side`: the right pane shows either the terminals or Files and Changes at full height, with a switcher.
 */

export const DOCK_MODES = ['stacked', 'bottom', 'side'] as const
export type DockMode = (typeof DOCK_MODES)[number]

/** What the right pane shows in `side` mode. */
export type SideView = 'files' | 'terminals'

export interface DockPrefs {
  readonly mode: DockMode
  readonly sideView: SideView
  /** `stacked`: the share of the right pane the terminal panel takes. */
  readonly stackedRatio: number
  /** `bottom`: the terminal panel's height in px. */
  readonly bottomHeight: number
}

export const STACKED_MIN = 0.15
export const STACKED_MAX = 0.85
export const BOTTOM_MIN = 120
export const BOTTOM_MAX = 900

export const DEFAULT_DOCK_PREFS: DockPrefs = { mode: 'stacked', sideView: 'files', stackedRatio: 0.4, bottomHeight: 280 }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export const clampStackedRatio = (ratio: number): number => clamp(ratio, STACKED_MIN, STACKED_MAX)
export const clampBottomHeight = (height: number): number => clamp(Math.round(height), BOTTOM_MIN, BOTTOM_MAX)

const isMode = (value: unknown): value is DockMode => (DOCK_MODES as readonly unknown[]).includes(value)

/** @param value - parsed JSON of unknown shape; anything unreadable gives the defaults field by field. */
export function parseDockPrefs(value: unknown): DockPrefs {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_DOCK_PREFS
  const record = value as Record<string, unknown>
  const number = (field: unknown, fallback: number): number => (typeof field === 'number' && Number.isFinite(field) ? field : fallback)
  return {
    mode: isMode(record.mode) ? record.mode : DEFAULT_DOCK_PREFS.mode,
    sideView: record.sideView === 'terminals' || record.sideView === 'files' ? record.sideView : DEFAULT_DOCK_PREFS.sideView,
    stackedRatio: clampStackedRatio(number(record.stackedRatio, DEFAULT_DOCK_PREFS.stackedRatio)),
    bottomHeight: clampBottomHeight(number(record.bottomHeight, DEFAULT_DOCK_PREFS.bottomHeight)),
  }
}

/** The mode the layout button switches to next: stacked, then bottom, then side, then back. */
export function nextMode(mode: DockMode): DockMode {
  return DOCK_MODES[(DOCK_MODES.indexOf(mode) + 1) % DOCK_MODES.length] ?? 'stacked'
}

const MODE_WORDS: Readonly<Record<DockMode, string>> = { stacked: 'stacked', bottom: 'bottom', side: 'side by side' }

/** The button's tooltip names where it would move the terminals, like the reference screens do. */
export function switchLabel(mode: DockMode): string {
  return `Switch to ${MODE_WORDS[nextMode(mode)]} terminal`
}
