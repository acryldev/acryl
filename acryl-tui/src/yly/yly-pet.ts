/**
 * The ACRYL pet (ACRYLY, technical id `YlyPet`): a pi-tui `Component` that
 * renders the YLY sprite frames (compiled into ANSI half-block strings) and
 * animates them with the mockup's exact clip timings (per-step `ms`, loop /
 * next-state, vertical bob). It occupies a fixed header region at the top-left
 * of the terminal while the conversation scrolls underneath.
 * @module acryl-tui/yly/yly-pet
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { YLY_FRAMES } from './yly-frames.generated.js'
import { YLY_CLIPS, YLY_SIZE_PRESETS, MIN_WIDTH, type YlySize, type YlyState } from './yly-programs.js'

function blank(cols: number): string {
  return ' '.repeat(cols)
}

export class YlyPet implements Component {
  private state: YlyState = 'idle'
  private step = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly tui: TUI) {}

  setMode(state: YlyState): void {
    if (state === this.state) return
    this.state = state
    this.step = 0
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  private clip() {
    return YLY_CLIPS[this.state]
  }

  private restart(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    const step = this.clip().steps[this.step] ?? this.clip().steps[0]
    if (step === undefined) return
    this.timer = setTimeout(() => this.advance(), step.ms)
  }

  private advance(): void {
    const clip = this.clip()
    const next = this.step + 1
    if (next >= clip.steps.length) {
      if (clip.loop) this.step = 0
      else if (clip.next !== undefined) {
        this.state = clip.next
        this.step = 0
      } else this.step = 0
    } else this.step = next
    this.invalidate()
    this.tui.requestRender()
    this.restart()
  }

  start(): void {
    this.restart()
  }

  stop(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  invalidate(): void {
    // State changed; the TUI repaints via requestRender() on the next pass.
  }

  private sizeForCols(width: number): YlySize | null {
    if (width >= 110) return 'large'
    if (width >= 90) return 'medium'
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
    // Vertical bob within a fixed height (no resize jitter): shift content by
    // blanking top/bottom rows alternately.
    const bob = clip.bob ?? 0
    for (let i = 0; i < bob; i++) {
      if (this.step % 2 === 0) rows = [blank(preset.cols), ...rows.slice(0, -1)]
      else rows = [...rows.slice(1), blank(preset.cols)]
    }
    return rows
  }
}
