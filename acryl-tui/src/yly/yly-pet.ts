/**
 * The ACRYL pet (ACRYLY, technical id `YlyPet`): a pi-tui `Component` that
 * renders the YLY sprite frames (compiled from the sprite board into plain
 * ANSI strings) and animates them by driving its own timer + `requestRender`,
 * exactly like the status-bar `Spinner`. It occupies a fixed header region at
 * the top-left of the terminal — the Claude-Code-style pet — while the
 * conversation scrolls underneath.
 * @module acryl-tui/yly/yly-pet
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { YLY_FRAMES } from './yly-frames.generated.js'
import { YLY_PROGRAMS, type YlyMode } from './yly-programs.js'

const PET_WIDTH = 26
const PET_HEIGHT = 9
/** Pet is hidden below this terminal width so it never squeezes the coding area. */
const MIN_WIDTH = 65

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g
const strip = (s: string): string => s.replace(ANSI_RE, '')
const vis = (s: string): number => strip(s).length

export class YlyPet implements Component {
  private mode: YlyMode = 'idle'
  private cursor = 0
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly tui: TUI) {}

  setMode(mode: YlyMode): void {
    if (mode === this.mode && this.timer !== undefined) return
    this.mode = mode
    this.cursor = 0
    this.invalidate()
    this.tui.requestRender()
    this.restartTimer()
  }

  private program() {
    return YLY_PROGRAMS[this.mode]
  }

  private restartTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = setInterval(() => {
      const frames = this.program().frames
      this.cursor = (this.cursor + 1) % frames.length
      this.invalidate()
      this.tui.requestRender()
    }, this.program().intervalMs)
  }

  private currentFrame(): readonly string[] {
    const frames = this.program().frames
    const index = frames[this.cursor % frames.length] ?? 0
    return YLY_FRAMES[index] ?? YLY_FRAMES[0] ?? []
  }

  start(): void {
    this.restartTimer()
  }

  stop(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  invalidate(): void {
    // State changed; the TUI repaints on the next render pass via requestRender().
  }

  render(width: number): string[] {
    if (width < MIN_WIDTH) return []
    const frame = this.currentFrame()
    // Center the sprite within a fixed PET_WIDTH so the animation is stable,
    // then drop empty trailing rows so the header stays compact.
    const lines = frame.slice(0, PET_HEIGHT).map(line => {
      const trimmed = line
      const pad = Math.floor((PET_WIDTH - vis(trimmed)) / 2)
      return `${' '.repeat(Math.max(0, pad))}${trimmed}`
    })
    return lines
  }
}
