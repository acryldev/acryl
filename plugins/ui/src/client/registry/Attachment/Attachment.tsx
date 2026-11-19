/**
 * Ported from shadcn/ui's Attachment (https://ui.shadcn.com/docs/components/attachment, MIT licence, registry item `attachment`, style new-york-v4,
 * fetched 2026-09-22). A file chip for a composer: media, title, description, actions, with an idle/uploading/processing/error/done state.
 * Tailwind utility classes replaced by a CSS Module on the app's own tokens; `cva`'s variants become classes; `asChild`/Slot (a Radix dependency) dropped
 * from `AttachmentTrigger`, which is a real `<button type="button">`. `AttachmentAction` is built on shadcn's own Button item in the source; the ghost
 * icon-button look is restated locally instead of importing that item, the same call `ToggleGroupItem` and `PaginationLink` already make.
 * `group-data-[...]` reach-across utilities become descendant selectors keyed off the root's own `data-state`/`data-size`/`data-orientation`, and the
 * source's `shimmer` utility is written out as the gradient-and-clip animation it is. Two substitutions worth naming: the source's `scroll-fade-x` and
 * `scrollbar-none` on `AttachmentGroup` are a mask-image gradient and a hidden scrollbar, which is what those utilities compile to. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Attachment.module.css'

export type AttachmentState = 'idle' | 'uploading' | 'processing' | 'error' | 'done'
export type AttachmentSize = 'default' | 'sm' | 'xs'
export type AttachmentOrientation = 'horizontal' | 'vertical'
export type AttachmentMediaVariant = 'icon' | 'image'

export interface AttachmentProps {
  state?: AttachmentState
  size?: AttachmentSize
  orientation?: AttachmentOrientation
  children?: ReactNode
  className?: string
}

/**
 * Render a file chip. Its `state` drives the dashed idle border, the error tint and the shimmer on the title while it uploads or processes.
 * @param props - the state, size and orientation, and the chip's parts.
 * @returns the element.
 */
export function Attachment({ state = 'done', size = 'default', orientation = 'horizontal', children, className }: AttachmentProps) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      data-size={size}
      data-orientation={orientation}
      className={clsx(css.attachment, orientation === 'vertical' ? css.vertical : css.horizontal, size === 'sm' ? css.sizeSmall : size === 'xs' ? css.sizeXs : css.sizeDefault, className)}
    >
      {children}
    </div>
  )
}

export function AttachmentMedia({ variant = 'icon', children, className }: { variant?: AttachmentMediaVariant, children?: ReactNode, className?: string }) {
  return <div data-slot="attachment-media" data-variant={variant} className={clsx(css.media, variant === 'image' ? css.mediaImage : undefined, className)}>{children}</div>
}

export function AttachmentContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="attachment-content" className={clsx(css.content, className)}>{children}</div>
}

export function AttachmentTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <span data-slot="attachment-title" className={clsx(css.title, className)}>{children}</span>
}

export function AttachmentDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <span data-slot="attachment-description" className={clsx(css.description, className)}>{children}</span>
}

export function AttachmentActions({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="attachment-actions" className={clsx(css.actions, className)}>{children}</div>
}

/** One icon action inside the chip's actions slot. `label` becomes the accessible name. */
export function AttachmentAction({ label, onClick, children, className }: { label?: string, onClick?: () => void, children?: ReactNode, className?: string }) {
  return (
    <button type="button" data-slot="attachment-action" aria-label={label} className={clsx(css.action, className)} onClick={onClick}>
      {children}
    </button>
  )
}

/** The whole-chip click target: it covers the attachment, so clicking the card opens the file. */
export function AttachmentTrigger({ label, onClick, className }: { label?: string, onClick?: () => void, className?: string }) {
  return <button type="button" data-slot="attachment-trigger" aria-label={label} className={clsx(css.trigger, className)} onClick={onClick} />
}

/** A horizontal, snapping row of attachments. */
export function AttachmentGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="attachment-group" className={clsx(css.group, className)}>{children}</div>
}