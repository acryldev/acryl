/**
 * Extracted from DSH: packages/client/ui-tool/src/client/tool/components/ToolRow.tsx (ToolRow), pinned deepseek-harness 5dda764ed3.
 * Kept from the original: the disclosure header (leading icon or state dot, title, separator dot, summary, chevron), the running sweep, the error summary that REPLACES the normal
 * summary, the visually hidden run-state label, and the IN/OUT card. Left in DSH: the tool-specific models and the specialised terminal, diff, read, search, web and image
 * cards (those are the app's TerminalBlock, DiffBlock and so on, already exported as primitives, so a consumer composes them as `children`). The wire-shaped props (ToolRowVariant,
 * models, locale `t`, slot renderer) are replaced by plain props. ToolCallCard.module.css is the original's rules for these parts. See manifest.yml.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { DisclosureRow, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import css from './ToolCallCard.module.css'

export type ToolCallState = 'running' | 'ok' | 'error' | 'stopped'

export interface ToolCallLabels {
  /** Heading of the input section. */
  input: string
  /** Heading of the output section. */
  output: string
  /** Visually hidden run-state text (a state dot and the sweep are colour-only). */
  running: string
  failed: string
  stopped: string
}

export interface ToolCallCardProps {
  /** Leading icon for a settled call (an error or stopped call shows a state dot instead, as in DSH). */
  icon: ReactNode
  title: string
  /** Collapsed one-line summary. */
  summary: string
  state: ToolCallState
  /** Replaces the summary on an error row (the failure's first line). */
  errorSummary?: string | null
  /** Expanded IN section text. */
  input?: string | null
  /** Expanded OUT section text. */
  output?: string | null
  labels: ToolCallLabels
  /** A specialised body (a TerminalBlock, DiffBlock ...) shown instead of the IN/OUT card. */
  children?: ReactNode
}

function leadingFor(state: ToolCallState, icon: ReactNode): ReactNode {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return icon
  }
}

function stateStatus(state: ToolCallState, labels: ToolCallLabels): string | null {
  switch (state) {
    case 'running': return labels.running
    case 'error': return labels.failed
    case 'stopped': return labels.stopped
    default: return null
  }
}

/**
 * Render a collapsible tool-call row.
 * @param props - copy, state and the optional expanded content.
 * @returns the row.
 */
export function ToolCallCard({ icon, title, summary, state, errorSummary = null, input = null, output = null, labels, children }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const expandable = input !== null || output !== null || children !== undefined
  const open = expanded && expandable
  const status = stateStatus(state, labels)
  // A failure must replace, not supplement, the normal summary.
  const failureLine = state === 'error' ? errorSummary : null
  const summaryText = failureLine ?? summary
  return (
    <div className={css.root} data-state={state}>
      {status !== null && <span className={css.visuallyHidden}>{status}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={leadingFor(state, icon)}
        title={title}
        open={open}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={() => { setExpanded(value => !value) }}
        collapsedContent={summaryText !== '' && (
          <>
            <span className={css.sep} aria-hidden />
            <span className={clsx(css.summary, failureLine !== null && css.errorSummary)}>{summaryText}</span>
          </>
        )}
      >
        <div className={css.bodyWrap}>
          {children !== undefined
            ? children
            : (
              <div className={css.ioCard}>
                {input !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{labels.input}</span>
                    <span className={css.ioText}>{input}</span>
                  </div>
                )}
                {input !== null && output !== null && <span className={css.ioDivider} aria-hidden />}
                {output !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{labels.output}</span>
                    <span className={css.ioText} data-error={state === 'error' || undefined}>{output}</span>
                  </div>
                )}
              </div>
            )}
        </div>
      </DisclosureRow>
    </div>
  )
}
