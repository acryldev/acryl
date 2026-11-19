/**
 * Ported from shadcn/ui's Bubble (https://ui.shadcn.com/docs/components/bubble, MIT licence, registry item `bubble`, style new-york-v4, fetched
 * 2026-09-22). A chat bubble and its reaction pill, meant to sit inside this library's `Message`. Tailwind utility classes replaced by a CSS Module
 * on the app's own tokens; `cva`'s variants become classes; `asChild`/Slot (a Radix dependency) dropped from `BubbleContent`. Two substitutions are
 * worth naming, because they are the only places this port is not a literal translation: (1) the source colours the child `[data-slot=bubble-content]`
 * from the parent, reproduced here with `.bubble[data-variant=...] .content` descendant selectors, so `BubbleContent` must stay inside `Bubble` for
 * the variant to show; (2) the `tinted` variant's relative-colour expressions (`oklch(from var(--primary) 0.93 calc(c*0.4) h)`, and its dark twin)
 * have no equivalent in the app's token set, so they are approximated with `color-mix` over `--acryl-accent`, which at least follows the scheme the
 * same way the alias tokens do. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Bubble.module.css'

export type BubbleVariant = 'default' | 'secondary' | 'muted' | 'tinted' | 'outline' | 'ghost' | 'destructive'
export type BubbleAlign = 'start' | 'end'

export interface BubbleProps {
  variant?: BubbleVariant
  align?: BubbleAlign
  children?: ReactNode
  className?: string
}

/**
 * Render a chat bubble shell. Its `BubbleContent` child takes the variant's colors.
 * @param props - the variant, which side the bubble sits on, and its parts.
 * @returns the element.
 */
export function Bubble({ variant = 'default', align = 'start', children, className }: BubbleProps) {
  return <div data-variant={variant} data-align={align} className={clsx(css.bubble, className)}>{children}</div>
}

export function BubbleGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="bubble-group" className={clsx(css.group, className)}>{children}</div>
}

export function BubbleContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="bubble-content" className={clsx(css.content, className)}>{children}</div>
}

export interface BubbleReactionsProps {
  side?: 'top' | 'bottom'
  align?: BubbleAlign
  children?: ReactNode
  className?: string
}

export function BubbleReactions({ side = 'bottom', align = 'end', children, className }: BubbleReactionsProps) {
  return <div data-side={side} data-align={align} className={clsx(css.reactions, className)}>{children}</div>
}