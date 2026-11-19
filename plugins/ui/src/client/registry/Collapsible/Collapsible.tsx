/**
 * Ported from shadcn/ui's Collapsible (https://ui.shadcn.com/docs/components/collapsible, MIT licence, registry item `collapsible`, style
 * new-york-v4, fetched 2026-09-22). The Radix `Collapsible.Root`/`CollapsibleTrigger`/`CollapsibleContent` primitives it wraps are dropped in favor of
 * plain React state. Distinct from this library's `DisclosureRow` (a fully-chromed row with an icon, title and chevron - see ToolCallCard): this is the
 * bare primitive with no chrome of its own, for when a plain trigger and a plain content block are all that is needed. See manifest.yml.
 */
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface CollapsibleContextValue {
  open: boolean
  toggle: () => void
}
const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

export interface CollapsibleProps {
  defaultOpen?: boolean
  children?: ReactNode
}

/**
 * Render a collapsible section (bare: no chrome, just open/close state shared with its children).
 * @param props - initial open state and content.
 * @returns the element.
 */
export function Collapsible({ defaultOpen = false, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)
  return <CollapsibleContext.Provider value={{ open, toggle: () => { setOpen(v => !v) } }}>{children}</CollapsibleContext.Provider>
}

export function CollapsibleTrigger({ children, className }: { children?: ReactNode, className?: string }) {
  const ctx = useContext(CollapsibleContext)
  return <button type="button" aria-expanded={ctx?.open ?? false} onClick={() => { ctx?.toggle() }} className={className}>{children}</button>
}

export function CollapsibleContent({ children, className }: { children?: ReactNode, className?: string }) {
  const ctx = useContext(CollapsibleContext)
  if (!(ctx?.open ?? false)) return null
  return <div className={className}>{children}</div>
}
