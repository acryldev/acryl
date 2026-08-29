/**
 * Mode → frame-sequence mapping for the YLY/ACRYLY pet, plus per-mode timing.
 * Each mode is a repeating sequence of indices into `YLY_FRAMES`.
 * @module acryl-tui/yly/yly-programs
 */

export type YlyMode = 'idle' | 'thinking' | 'tool' | 'working' | 'streaming' | 'error' | 'success'

export interface YlyProgram {
  /** Repeating frame indices (into YLY_FRAMES). Longer/slower cycles for idle, faster for streaming. */
  readonly frames: readonly number[]
  /** Timer interval in ms for this mode. */
  readonly intervalMs: number
}

export const YLY_PROGRAMS: Record<YlyMode, YlyProgram> = {
  // Barely moves; occasional blink (frame 0 most of the time, frame 1 blink).
  idle: { frames: [0, 0, 0, 0, 1], intervalMs: 400 },
  // Subtle left/right shift.
  thinking: { frames: [2, 3], intervalMs: 450 },
  // Claws open/close.
  tool: { frames: [4, 5], intervalMs: 260 },
  // Left/right walking cycle.
  working: { frames: [6, 7, 8], intervalMs: 200 },
  // Mouth smile/neutral while the answer streams.
  streaming: { frames: [9, 10, 11], intervalMs: 140 },
  // Freeze briefly on error.
  error: { frames: [6], intervalMs: 300 },
  // One tiny claw wave on success.
  success: { frames: [5, 4], intervalMs: 200 },
}
