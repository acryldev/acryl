/**
 * Pure text builder for the startup banner: a bordered box with the brand
 * logo on the left and session info on the right. Kept dependency-free (no
 * Ink/React) so it's trivial to reason about and test in isolation,
 * mirroring `render.ts`'s hand-rolled ANSI-aware formatting.
 * @module @tomowang/dsh-tui/tui/bannerText
 */

import { truncate } from '../render.js'
import { LOGO_HALF_BLOCK } from './logoArt.generated.js'
import { theme, fg } from './theme.js'

export interface BannerContent {
  readonly version: string
  readonly provider: string
  readonly model: string
  readonly cwd: string // already `~`-abbreviated by the caller
}

const ESC = '\x1b['
const bold = (s: string): string => `${ESC}1m${s}${ESC}0m`

const dim = fg(theme.muted)
const primary = fg(theme.primary)

// eslint-disable-next-line no-control-regex -- \x1b deliberately matches the ANSI escape byte, not a typo.
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g
const visibleWidth = (s: string): number => s.replace(ANSI_RE, '').length
const padVisible = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - visibleWidth(s)))

const LOGO_WIDTH = 16
const LOGO_MARGIN = 2 // spaces on each side of the logo within the left column
const LEFT_WIDTH = LOGO_WIDTH + LOGO_MARGIN * 2
const MIN_WIDTH = 56
const MAX_WIDTH = 96

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Pads `rows` with blank lines, split evenly top/bottom, to reach `height`. */
function centerRows(rows: readonly string[], height: number): string[] {
  const pad = Math.max(0, height - rows.length)
  const top = Math.floor(pad / 2)
  const bottom = pad - top
  return [...Array<string>(top).fill(''), ...rows, ...Array<string>(bottom).fill('')]
}

function topBorder(title: string, total: number): string {
  const inner = total - 2
  const label = ` ${title} `
  const leftDashes = 3
  const rightDashes = Math.max(1, inner - leftDashes - label.length)
  return `╭${'─'.repeat(leftDashes)}${primary(label)}${'─'.repeat(rightDashes)}╮`
}

function buildLeftColumn(): string[] {
  const margin = ' '.repeat(LOGO_MARGIN)
  return LOGO_HALF_BLOCK.map(line => margin + padVisible(line, LOGO_WIDTH) + margin)
}

function buildRightColumn(content: BannerContent, width: number): string[] {
  return [
    bold(primary('ACRYL')),
    '',
    dim(`${content.provider}/${content.model}`),
    dim(truncate(content.cwd, width)),
  ]
}

/**
 * Builds the full multi-line banner text, sized to the given terminal
 * width: title bar, then a fixed-width logo column beside a session-info
 * column (vertically centered against each other), then the bottom border.
 */
export function buildBannerText(content: BannerContent, columns: number): string {
  const total = clamp(columns, MIN_WIDTH, MAX_WIDTH)
  const inner = total - 2
  const top = topBorder(`ACRYL v${content.version}`, total)
  const bottom = `╰${'─'.repeat(inner)}╯`

  const rightWidth = inner - LEFT_WIDTH - 1
  const left = buildLeftColumn()
  const right = buildRightColumn(content, rightWidth)
  const height = Math.max(left.length, right.length)
  const leftRows = centerRows(left, height)
  const rightRows = centerRows(right, height)

  const body = leftRows.map(
    (line, i) => `│${padVisible(line, LEFT_WIDTH)}│${padVisible(rightRows[i] ?? '', rightWidth)}│`,
  )
  return [top, ...body, bottom].join('\n')
}
