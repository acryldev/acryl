/**
 * Ported from shadcn/ui's Item (https://ui.shadcn.com/docs/components/item, MIT licence, registry item `item`, style new-york-v4, fetched 2026-09-22). A row of
 * media, content and actions used inside a list. Tailwind utility classes replaced by a CSS Module on the app's own tokens; `cva`'s variants become classes;
 * `asChild`/Slot (a Radix dependency) dropped from `Item`. `ItemSeparator` is built on shadcn's own Separator item in the source; importing that item's file
 * across item boundaries would break self-containment, so it restates the same one-rule divider locally - the precedent set by `ButtonGroupSeparator`. The
 * source's `group-has-[[data-slot=item-description]]/item` rule on the media becomes `:has()`, and `[&+[data-slot=item-content]]:flex-none` becomes a sibling
 * selector. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Item.module.css'

export type ItemVariant = 'default' | 'outline' | 'muted'
export type ItemSize = 'default' | 'sm'
export type ItemMediaVariant = 'default' | 'icon' | 'image'

export interface ItemProps {
  variant?: ItemVariant
  size?: ItemSize
  children?: ReactNode
  className?: string
}

/**
 * Render one row of a list: media alongside content, with room for actions.
 * @param props - the variant (plain, outlined, or a muted surface), the size, and the row's parts.
 * @returns the element.
 */
export function Item({ variant = 'default', size = 'default', children, className }: ItemProps) {
  return (
    <div
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={clsx(css.item, variant === 'outline' ? css.outline : variant === 'muted' ? css.muted : undefined, size === 'sm' ? css.sizeSmall : css.sizeDefault, className)}
    >
      {children}
    </div>
  )
}

export function ItemGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div role="list" data-slot="item-group" className={clsx(css.group, className)}>{children}</div>
}

// A plain divider, not this library's own Separator item: importing a sibling item's file would make this item
// depend on another item's directory, breaking self-containment (the same class of bug found and fixed in
// SwitchField, and what the ingest gate now rejects).
export function ItemSeparator({ className }: { className?: string }) {
  return <div role="none" data-slot="item-separator" className={clsx(css.separator, className)} />
}

export function ItemMedia({ variant = 'default', children, className }: { variant?: ItemMediaVariant, children?: ReactNode, className?: string }) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={clsx(css.media, variant === 'icon' ? css.mediaIcon : variant === 'image' ? css.mediaImage : css.mediaDefault, className)}
    >
      {children}
    </div>
  )
}

export function ItemContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="item-content" className={clsx(css.content, className)}>{children}</div>
}

export function ItemTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="item-title" className={clsx(css.title, className)}>{children}</div>
}

export function ItemDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <p data-slot="item-description" className={clsx(css.description, className)}>{children}</p>
}

export function ItemActions({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="item-actions" className={clsx(css.actions, className)}>{children}</div>
}

export function ItemHeader({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="item-header" className={clsx(css.header, className)}>{children}</div>
}

export function ItemFooter({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="item-footer" className={clsx(css.footer, className)}>{children}</div>
}