/**
 * DeepSeek brand palette for the TUI. Keep color decisions semantic so every
 * Ink surface and the raw-ANSI `render.ts`/`bannerText.ts` helpers share the
 * same visual language — see `DESIGN.md` for the full rationale and the
 * component-mapping guide this table is drawn from.
 *
 * The terminal still owns its background and default foreground; these are
 * foreground tokens for interactive, stateful, and brand elements only —
 * this TUI renders to native scrollback (no painted panel backgrounds), so
 * DeepSeek's `surface`/`bg-dark`/`border-dim` tokens are deliberately not
 * represented here.
 * @module @tomowang/dsh-tui/tui/theme
 */

export const theme = {
  /** DeepSeek Blue — brand banner/ASCII, active input border. */
  primary: '#4F6BFE',
  /** Electric Cyan — section headers, streaming/progress indicators. */
  secondary: '#38BDF8',
  /** Slate Indigo — badges (active provider/model). */
  accent: '#818CF8',
  /** Thought Violet — reasoning/thinking content, set apart from assistant text; see `formatReasoningSummary`/`formatStreamingText` in `src/render.ts`. */
  reasoning: '#A855F7',
  /** Mint Emerald. */
  success: '#34D399',
  /** Amber Sun. */
  warning: '#FBBF24',
  /** Coral Red. */
  error: '#F87171',
  /** DeepSeek uses its primary blue for informational UI. */
  info: '#4F6BFE',
  /** Slate Gray — dim/secondary text (labels, hints, timestamps). */
  muted: '#94A3B8',
} as const

/** 24-bit-color ANSI wrapper, shared by every raw-ANSI formatter (`render.ts`, `markdown.ts`, `bannerText.ts`) and every pi-tui component theme adapter. */
export function fg(hex: string): (s: string) => string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
}
