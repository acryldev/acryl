/**
 * Stepper — a step progress indicator for multi-step workflows.
 * Self-contained; no cross-item imports. Built on ACRYL's --dsw-alias-* tokens.
 * See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Stepper.module.css'

export interface Step {
  /** Step label. */
  label: ReactNode
  /** Optional description shown below the label. */
  description?: ReactNode
}

export interface StepperProps {
  /** Ordered list of steps. */
  steps: Step[]
  /** Index of the current active step (0-based). */
  current: number
  /** Orientation. */
  orientation?: 'horizontal' | 'vertical'
  /** Extra class name. */
  className?: string
}

/**
 * A step progress indicator.
 */
export function Stepper({ steps, current, orientation = 'horizontal', className }: StepperProps) {
  return (
    <div className={clsx(css.stepper, css[`orientation--${orientation}`], className)} role="navigation" aria-label="Progress">
      {steps.map((step, i) => {
        const state = i < current ? 'completed' : i === current ? 'active' : 'pending'
        return (
          <div key={i} className={clsx(css.step, css[`step--${state}`])}>
            <div className={clsx(css.indicator, css[`indicator--${state}`])} aria-hidden>
              {state === 'completed' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <div className={css.body}>
              <span className={clsx(css.label, css[`label--${state}`])}>{step.label}</span>
              {step.description !== undefined && <span className={css.description}>{step.description}</span>}
            </div>
            {i < steps.length - 1 && <div className={clsx(css.connector, css[`connector--${state}`])} aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}
