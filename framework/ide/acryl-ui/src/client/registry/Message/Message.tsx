/**
 * Ported from shadcn/ui's Message (https://ui.shadcn.com/docs/components/message, MIT licence, registry item `message`, style new-york-v4, fetched
 * 2026-09-22). The message row around a Bubble: avatar, header, content, footer. Tailwind utility classes replaced by a CSS Module on the app's own
 * tokens; `cn()` replaced by `clsx`. The source's two group utilities that reach across the row - `group-has-data-[slot=message-footer]/message`
 * on the avatar and `group-data-[align=end]/message:*:data-slot:self-end` on the content - become `:has()` and child-attribute selectors in the
 * module. The parts keep their `data-slot` attributes because those selectors (and the Bubble item's) key off them. No Radix primitive is
 * involved, so nothing was dropped. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Message.module.css'

export type MessageAlign = 'start' | 'end'

export interface MessageProps {
  align?: MessageAlign
  children?: ReactNode
  className?: string
}

/**
 * Render a message row: content first, avatar alongside, reversed when `align` is `end`.
 * @param props - which side the message sits on, and its parts.
 * @returns the element.
 */
export function Message({ align = 'start', children, className }: MessageProps) {
  return <div data-slot="message" data-align={align} className={clsx(css.message, className)}>{children}</div>
}

export function MessageGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="message-group" className={clsx(css.group, className)}>{children}</div>
}

export function MessageAvatar({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="message-avatar" className={clsx(css.avatar, className)}>{children}</div>
}

export function MessageContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="message-content" className={clsx(css.content, className)}>{children}</div>
}

export function MessageHeader({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="message-header" className={clsx(css.header, className)}>{children}</div>
}

export function MessageFooter({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="message-footer" className={clsx(css.footer, className)}>{children}</div>
}