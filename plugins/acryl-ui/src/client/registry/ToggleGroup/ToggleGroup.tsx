/**
 * Ported from shadcn/ui's ToggleGroup (https://ui.shadcn.com/docs/components/toggle-group, MIT licence, registry item `toggle-group`, style
 * new-york-v4, fetched 2026-09-22). The Radix `ToggleGroup.Root`/`Item` primitives it wraps are dropped for plain React state (a selected-id set);
 * single or multiple selection is a prop, matching shadcn's own `type`. Its buttons restate this library's `Toggle` styling locally rather than
 * importing that item's file - importing a sibling item would break this item's self-containment (the same class of bug found in SwitchField and
 * ButtonGroupSeparator). cva variants replaced by a CSS Module. See manifest.yml.
 */
import { createContext, useContext } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './ToggleGroup.module.css'

interface ToggleGroupContextValue {
  isSelected: (id: string) => boolean
  select: (id: string) => void
}
const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null)

export interface ToggleGroupProps {
  type: 'single' | 'multiple'
  value: string | readonly string[]
  onChange: (value: string | string[]) => void
  children?: ReactNode
  className?: string
}

/**
 * Render a row of toggle buttons sharing a single- or multiple-selection model.
 * @param props - selection type, value, change handler and content.
 * @returns the element.
 */
export function ToggleGroup({ type, value, onChange, children, className }: ToggleGroupProps) {
  const selected = new Set(type === 'multiple' ? (value as readonly string[]) : value === '' ? [] : [value as string])
  const select = (id: string) => {
    if (type === 'multiple') {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id); else next.add(id)
      onChange([...next])
    } else {
      onChange(selected.has(id) ? '' : id)
    }
  }
  return (
    <ToggleGroupContext.Provider value={{ isSelected: (id) => selected.has(id), select }}>
      <div role="group" className={clsx(css.group, className)}>{children}</div>
    </ToggleGroupContext.Provider>
  )
}

export function ToggleGroupItem({ value, children, className }: { value: string, children?: ReactNode, className?: string }) {
  const ctx = useContext(ToggleGroupContext)
  const pressed = ctx?.isSelected(value) ?? false
  return (
    <button type="button" aria-pressed={pressed} onClick={() => { ctx?.select(value) }} className={clsx(css.item, pressed && css.pressed, className)}>
      {children}
    </button>
  )
}
