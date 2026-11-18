/**
 * Ported from shadcn/ui's Accordion (https://ui.shadcn.com/docs/components/accordion, MIT licence, registry item `accordion`, style new-york-v4, fetched
 * 2026-09-22). The Radix `Accordion.Root`/`Item`/`Trigger`/`Content` primitives it wraps are dropped in favor of plain React state (open item id(s));
 * this library's own `DisclosureRow` already exists for a single collapsible row (see ToolCallCard's use of it), but shadcn's Accordion additionally
 * supports several sibling items sharing one open/close model (`type="single"` or `"multiple"`), which `DisclosureRow` does not - that is the real gap
 * this fills. lucide-react's ChevronDownIcon replaced by a plain inline SVG (no new dependency). See manifest.yml.
 */
import { createContext, useContext, useState } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Accordion.module.css'

interface AccordionContextValue {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
}
const AccordionContext = createContext<AccordionContextValue | null>(null)

export interface AccordionProps {
  type: 'single' | 'multiple'
  children?: ReactNode
  className?: string
}

/**
 * Render an accordion: one or more collapsible items sharing an open/close model.
 * @param props - `single` (one item open at a time) or `multiple`, and content.
 * @returns the element.
 */
export function Accordion({ type, children, className }: AccordionProps) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => {
    setOpen((current) => {
      const next = new Set(type === 'multiple' ? current : [])
      if (current.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <AccordionContext.Provider value={{ isOpen: (id) => open.has(id), toggle }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  )
}

const ItemIdContext = createContext<string>('')

export function AccordionItem({ value, children, className }: { value: string, children?: ReactNode, className?: string }) {
  return (
    <ItemIdContext.Provider value={value}>
      <div className={clsx(css.item, className)}>{children}</div>
    </ItemIdContext.Provider>
  )
}

export function AccordionTrigger({ children, className }: { children?: ReactNode, className?: string }) {
  const ctx = useContext(AccordionContext)
  const id = useContext(ItemIdContext)
  const open = ctx?.isOpen(id) ?? false
  return (
    <button type="button" aria-expanded={open} onClick={() => { ctx?.toggle(id) }} className={clsx(css.trigger, className)}>
      {children}
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={clsx(css.chevron, open && css.chevronOpen)}><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </button>
  )
}

export function AccordionContent({ children, className }: { children?: ReactNode, className?: string }) {
  const ctx = useContext(AccordionContext)
  const id = useContext(ItemIdContext)
  if (!(ctx?.isOpen(id) ?? false)) return null
  return <div className={clsx(css.content, className)}>{children}</div>
}
