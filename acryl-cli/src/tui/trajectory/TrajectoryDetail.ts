/**
 * Pure line-builder for the `/trajectory` overlay's tabbed detail pane —
 * tabs vary by the selected record's kind (see `detailTabsFor`), content
 * word-wrapped to the pane's width and line-clamped to fit its height
 * budget. Wrapping matters here specifically because `buildDetail`'s
 * Preview/Raw/Payload/Schema content can be arbitrarily long prose or JSON
 * with no line breaks of its own — unlike a browser, the terminal won't wrap
 * it for us.
 * @module @tomowang/dsh-tui/tui/trajectory/TrajectoryDetail
 */

import { wrapTextWithAnsi } from '@earendil-works/pi-tui'
import type { RenderOptions } from '../../render.js'
import { buildDetail } from './detail.js'
import { detailTabsFor, type TrajectoryDetailTab, type TrajectoryRecord } from './types.js'
import { theme, fg } from '../theme.js'

const muted = fg(theme.muted)

/** Left padding for the panel's body, under its flush-left tab-bar heading — mirrors the ledger's own "Turn" header / indented "Step" row convention (`TrajectoryLedger.ts`). */
const DETAIL_INDENT = '  '

/** Right padding, matching `DETAIL_INDENT`'s width — reserved purely by wrapping short of the pane's edge, since there's no trailing character to place there. */
const DETAIL_RIGHT_PADDING = DETAIL_INDENT.length

export function buildDetailLines(
  record: TrajectoryRecord | undefined,
  tab: TrajectoryDetailTab,
  maxLines: number,
  getTool: RenderOptions['getTool'],
  width: number,
): string[] {
  const wrapWidth = Math.max(1, width - DETAIL_INDENT.length - DETAIL_RIGHT_PADDING)
  const lines = record === undefined ? [] : wrapTextWithAnsi(buildDetail(record, tab, getTool), wrapWidth)
  const shown = lines.slice(0, maxLines)
  const hidden = lines.length - shown.length

  const tabs = record === undefined ? [] : detailTabsFor(record)
  const tabBar = tabs.map(candidate => (candidate === tab ? `[${candidate}]` : ` ${candidate} `)).join(' ')
  const out: string[] = [tabBar]
  if (record === undefined) {
    out.push(`${DETAIL_INDENT}${muted('(no record selected)')}`)
  } else {
    out.push(...shown.map(line => `${DETAIL_INDENT}${line}`))
  }
  if (hidden > 0) out.push(`${DETAIL_INDENT}${muted(`… ${hidden} more line${hidden === 1 ? '' : 's'}`)}`)
  return out
}
