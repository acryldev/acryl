/**
 * Ported from shadcn/ui's ButtonGroup (https://ui.shadcn.com/docs/components/button-group, MIT licence, registry item `button-group`, style
 * new-york-v4, fetched 2026-09-22). cva's variant classes replaced by a CSS Module; `ButtonGroupSeparator`'s dependency on shadcn's own Separator is
 * NOT replaced by this library's own `Separator` (registry/Separator) - that would be a cross-item import, breaking self-containment - it restates
 * the same two-rule divider locally instead (see the component below). `asChild`/Slot (a Radix dependency) dropped from `ButtonGroupText`. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './ButtonGroup.module.css'

export interface ButtonGroupProps {
  children?: ReactNode
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

/**
 * Render a row (or column) of controls with their corners merged.
 * @param props - content and orientation.
 * @returns the element.
 */
export function ButtonGroup({ children, orientation = 'horizontal', className }: ButtonGroupProps) {
  return <div role="group" className={clsx(css.group, orientation === 'vertical' ? css.vertical : css.horizontal, className)}>{children}</div>
}

export function ButtonGroupText({ children, className }: { children?: ReactNode, className?: string }) {
  return <div className={clsx(css.text, className)}>{children}</div>
}

// A plain divider, not this library's own Separator item: importing a sibling item's file would make
// this item depend on another item's directory, breaking self-containment (the same class of bug found
// and fixed in SwitchField). Same two lines, duplicated on purpose.
export function ButtonGroupSeparator({ orientation = 'vertical', className }: { orientation?: 'horizontal' | 'vertical', className?: string }) {
  return <div role="none" className={clsx(orientation === 'vertical' ? css.separatorVertical : css.separatorHorizontal, className)} />
}
