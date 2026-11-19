/**
 * Ported from shadcn/ui's Label (https://ui.shadcn.com/docs/components/label, MIT licence, registry item `label`, style new-york-v4, fetched 2026-09-22).
 * The Radix `Label.Root` primitive it wraps is dropped - a form label needs no interactive behavior beyond the native `<label for>` association, which
 * this already has. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Label.module.css'

export interface LabelProps {
  htmlFor?: string
  children?: ReactNode
  className?: string
}

/**
 * Render a form label.
 * @param props - the control it labels, content and an extra class.
 * @returns the element.
 */
export function Label({ htmlFor, children, className }: LabelProps) {
  return <label htmlFor={htmlFor} className={clsx(css.label, className)}>{children}</label>
}
