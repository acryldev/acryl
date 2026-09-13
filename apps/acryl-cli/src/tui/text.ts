/**
 * Thin pi-tui `Component` wrappers around already-ANSI-styled strings.
 * `render.ts`/`markdown.ts`/`bannerText.ts` produce terminal-ready text
 * (colors, bold, links baked in via raw SGR/OSC sequences) — these wrappers
 * exist only to satisfy pi-tui's `Component` interface (`render(width)`,
 * `invalidate()`) without re-styling that text, mirroring how the old Ink
 * `<Text>` usage printed these strings unmodified.
 * @module @tomowang/dsh-tui/tui/text
 */

import { wrapTextWithAnsi, Text, type Component } from '@earendil-works/pi-tui'

/** Left/right margin applied to main-panel message content, so it doesn't sit flush against either terminal edge. */
const TRANSCRIPT_MARGIN = 2
const TRANSCRIPT_INDENT = ' '.repeat(TRANSCRIPT_MARGIN)

/** Word-wraps already-ANSI-styled text to fit within `width` minus the transcript's left/right margin, then indents every resulting line. Used by the live-region rows (streaming text, pending tool calls, live shell output), which rebuild their string from the store on every render — see `createTranscriptLine` for the settled, append-only transcript rows, which get the same margin from pi-tui's own `Text` instead so repeated renders can be cached. */
export function padTranscriptText(text: string, width: number): string[] {
  if (text === '') return []
  const usableWidth = Math.max(1, width - TRANSCRIPT_MARGIN * 2)
  return wrapTextWithAnsi(text, usableWidth).map(line => `${TRANSCRIPT_INDENT}${line}`)
}

/** A settled transcript line: pi-tui's `Text` component wraps to width and applies the same left/right margin as `padTranscriptText`, but — unlike our own `Component`s here — caches its wrapped output keyed on `(text, width)`, so appended transcript history isn't re-wrapped on every unrelated store update (e.g. a streaming token delta) the way a hand-rolled render() would. Content is fixed at construction — transcript rows are append-only and never mutated after being added. */
export function createTranscriptLine(text: string): Component {
  return new Text(text, TRANSCRIPT_MARGIN, 0)
}

/** A block of pre-styled text rebuilt from the current viewport width on every render — for content (the banner) whose own layout is width-responsive. */
export class DynamicText implements Component {
  constructor(private readonly build: (width: number) => string) {}

  invalidate(): void {}

  render(width: number): string[] {
    const text = this.build(width)
    return text === '' ? [] : text.split('\n')
  }
}
