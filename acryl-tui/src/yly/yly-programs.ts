/**
 * ACRYL YLY pet animation programs — a faithful port of the react mockup's
 * `ylyAnimations.ts` (frame indices + per-step ms + loop/next + bob). A pi-tui
 * terminal renders these frame-for-frame. Frame names follow `ylyFrames.ts`
 * (sheet cell indices 0..12).
 * @module acryl-tui/yly/yly-programs
 */

export type YlyState = 'idle' | 'thinking' | 'walking' | 'tool' | 'typing' | 'success' | 'error' | 'sleeping'

export interface YlyStep {
  /** sheet cell index (see yly-frames generated F map). */
  readonly frame: number
  /** how long the frame is held, in ms. */
  readonly ms: number
}

export interface YlyClip {
  readonly steps: readonly YlyStep[]
  readonly loop: boolean
  /** state entered automatically when a non-looping clip finishes. */
  readonly next?: YlyState
  /** vertical bob amplitude in terminal rows (0 = still). */
  readonly bob?: number
}

// Sheet cell indices (sheet: standSmile=0 … standSmileAlt=12).
const F = { standSmile: 0, standArmsUp: 1, reachRight: 2, reachWide: 3, clawSoftLeft: 4, clawSoftRight: 5, strideLeft: 6, strideRight: 7, leanBack: 8, leanLow: 9, crouch: 10, neutralMouth: 11, standSmileAlt: 12 } as const

export const YLY_CLIPS: Record<YlyState, YlyClip> = {
  idle: {
    loop: true,
    bob: 0,
    steps: [
      { frame: F.standSmile, ms: 2600 },
      { frame: F.neutralMouth, ms: 140 },
      { frame: F.standSmile, ms: 3200 },
      { frame: F.clawSoftLeft, ms: 420 },
      { frame: F.standSmileAlt, ms: 4200 },
      { frame: F.neutralMouth, ms: 120 },
      { frame: F.standSmileAlt, ms: 2400 },
      { frame: F.clawSoftRight, ms: 380 },
    ],
  },
  thinking: {
    loop: true,
    bob: 1,
    steps: [
      { frame: F.leanBack, ms: 320 },
      { frame: F.leanLow, ms: 300 },
      { frame: F.crouch, ms: 260 },
      { frame: F.leanLow, ms: 300 },
    ],
  },
  walking: {
    loop: true,
    bob: 1,
    steps: [
      { frame: F.strideLeft, ms: 150 },
      { frame: F.standSmileAlt, ms: 130 },
      { frame: F.strideRight, ms: 150 },
      { frame: F.standSmile, ms: 130 },
    ],
  },
  tool: {
    loop: true,
    bob: 0,
    steps: [
      { frame: F.reachRight, ms: 180 },
      { frame: F.reachWide, ms: 200 },
      { frame: F.clawSoftRight, ms: 160 },
      { frame: F.reachWide, ms: 200 },
    ],
  },
  typing: {
    loop: true,
    bob: 0,
    steps: [
      { frame: F.clawSoftLeft, ms: 190 },
      { frame: F.standSmileAlt, ms: 170 },
      { frame: F.clawSoftRight, ms: 190 },
      { frame: F.standSmile, ms: 170 },
    ],
  },
  success: {
    loop: false,
    next: 'idle',
    bob: 2,
    steps: [
      { frame: F.standArmsUp, ms: 180 },
      { frame: F.reachWide, ms: 200 },
      { frame: F.standArmsUp, ms: 180 },
      { frame: F.reachWide, ms: 200 },
      { frame: F.standSmile, ms: 240 },
    ],
  },
  error: {
    loop: false,
    next: 'idle',
    bob: 0,
    steps: [
      { frame: F.neutralMouth, ms: 1100 },
      { frame: F.leanBack, ms: 420 },
      { frame: F.neutralMouth, ms: 520 },
    ],
  },
  sleeping: {
    loop: true,
    bob: 0,
    steps: [
      { frame: F.neutralMouth, ms: 3800 },
      { frame: F.crouch, ms: 900 },
    ],
  },
}

/** Terminal size presets (cols x rows) mirroring the mockup's responsive sizes. */
export const YLY_SIZE_PRESETS = {
  small: { cols: 10, rows: 6 },
  medium: { cols: 14, rows: 8 },
  large: { cols: 20, rows: 11 },
} as const

export type YlySize = keyof typeof YLY_SIZE_PRESETS

/** Pet is hidden below this terminal width; content always wins. */
export const MIN_WIDTH = 76
