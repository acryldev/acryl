/**
 * The ACRYL pet (ACRYLY, technical id `YlyPet`): a pi-tui `Component` that
 * renders the YLY sprite frames (compiled into ANSI half-block strings) and
 * animates them with the mockup's exact clip timings (per-step `ms`, loop /
 * next-state, vertical bob). It occupies a fixed header region at the top-left
 * of the terminal while the conversation scrolls underneath.
 *
 * To avoid distracting the reader, the animation is NOT continuous: the pet
 * alternates between random-length *rest* periods (a frozen canonical frame,
 * no movement) and random-length *active* bursts (the mode's clip plays). A
 * mode change (`setMode`) wakes it into an active burst so an agent turn still
 * reads as activity, and the status bar carries the live state meanwhile.
 * @module acryl-tui/yly/yly-pet
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { YLY_FRAMES } from './yly-frames.generated.js'
import { YLY_CLIPS, YLY_SIZE_PRESETS, MIN_WIDTH, type YlySize, type YlyState } from './yly-programs.js'

function blank(cols: number): string {
  return ' '.repeat(cols)
}

/** Random rest (paused) length in ms — the pet holds a static frame, no motion. */
function randomRestMs(): number {
  return 4000 + Math.random() * 8000
}

/** Random active (animating) burst length in ms. */
function randomActiveMs(): number {
  return 1600 + Math.random() * 3200
}

export interface YlyPetOptions {
  /** Rest (paused) duration source, in ms. Defaults to a random 4-12s. */
  readonly restMs?: () => number
  /** Active (animating) burst duration source, in ms. Defaults to a random 1.6-4.8s. */
  readonly activeMs?: () => number
}

export class YlyPet implements Component {
  private state: YlyState = 'idle'
  private step = 0
  private phase: 'rest' | 'active' = 'active'
  private activeElapsed = 0
  private restDuration: number
  private activeDuration: number
  private readonly restMs: () => number
  private readonly activeMs: () => number
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly tui: TUI,
    options: YlyPetOptions = {},
  ) {
    this.restMs = options.restMs ?? randomRestMs
    this.activeMs = options.activeMs ?? randomActiveMs
    this.restDuration = this.restMs()
    this.activeDuration = this.activeMs()
  }

  setMode(state: YlyState): void {
    if (state === this.state) return
    this.state = state
    this.step = 0
    // A mode change is a wake-up: start fresh in an active burst so a turn
    // still reads as the pet doing something, not frozen.
    this.phase = 'active'
    this.activeElapsed = 0
    this.activeDuration = this.activeMs()
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  private clip() {
    return YLY_CLIPS[this.state]
  }

  private restart(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    if (this.phase === 'rest') {
      this.timer = setTimeout(() => this.activate(), this.restDuration)
      return
    }
    const step = this.clip().steps[this.step] ?? this.clip().steps[0]
    if (step === undefined) return
    this.timer = setTimeout(() => this.advance(), step.ms)
  }

  private activate(): void {
    this.phase = 'active'
    this.step = 0
    this.activeElapsed = 0
    this.activeDuration = this.activeMs()
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  private deactivate(): void {
    this.phase = 'rest'
    this.step = 0 // freeze on the mode's canonical first frame, no bob
    this.restDuration = this.restMs()
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  private advance(): void {
    const clip = this.clip()
    const step = clip.steps[this.step] ?? clip.steps[0]
    if (step !== undefined) this.activeElapsed += step.ms
    const next = this.step + 1
    if (next >= clip.steps.length) {
      if (clip.loop) this.step = 0
      else if (clip.next !== undefined) {
        this.state = clip.next
        this.step = 0
      } else this.step = 0
    } else this.step = next
    if (this.activeElapsed >= this.activeDuration) {
      this.deactivate()
      return
    }
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  start(): void {
    this.restart()
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  invalidate(): void {
    // State changed; the TUI repaints via requestRender() on the next pass.
  }

  private sizeForCols(width: number): YlySize | null {
    if (width >= 132) return 'large'
    if (width >= 112) return 'medium'
    if (width >= MIN_WIDTH) return 'small'
    return null
  }

  render(_width: number): string[] {
    // Size against the real terminal width, not this component's stack slot.
    const cols = this.tui.terminal.columns
    const size = this.sizeForCols(cols)
    if (size === null) return []
    const preset = YLY_SIZE_PRESETS[size]
    const clip = this.clip()
    const step = clip.steps[this.step] ?? clip.steps[0]
    let rows = [...(YLY_FRAMES[size]?.[step?.frame ?? 0] ?? [])]
    // Vertical bob within a fixed height — only while actively animating; a
    // resting pet holds its canonical frame perfectly still.
    const bob = this.phase === 'rest' ? 0 : (clip.bob ?? 0)
    for (let i = 0; i < bob; i++) {
      if (this.step % 2 === 0) rows = [blank(preset.cols), ...rows.slice(0, -1)]
      else rows = [...rows.slice(1), blank(preset.cols)]
    }
    return rows
  }
}
