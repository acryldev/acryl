/**
 * Ported from shadcn/ui's Pagination (https://ui.shadcn.com/docs/components/pagination, MIT licence, registry item `pagination`, style new-york-v4,
 * fetched 2026-09-22). `PaginationLink` is built on shadcn's own Button item in the source (`buttonVariants`); importing that item's file across
 * item boundaries would break self-containment (the bug class this registry's ingest gate rejects), so the ghost/outline link look is restated
 * locally in this module - the same precedent as `ToggleGroupItem` and `ButtonGroupSeparator`. lucide-react's ChevronLeft/ChevronRight/
 * MoreHorizontal are replaced by plain inline SVGs (no new dependency). The source's `hidden sm:block` on the Previous/Next labels is kept as a
 * width query in the module. See manifest.yml.
 */
import clsx from 'clsx'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import css from './Pagination.module.css'

/**
 * Render the pagination landmark around a set of page links.
 * @param props - the links.
 * @returns the element.
 */
export function Pagination({ children, className }: { children?: ReactNode, className?: string }) {
  return <nav role="navigation" aria-label="pagination" className={clsx(css.pagination, className)}>{children}</nav>
}

export function PaginationContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <ul className={clsx(css.content, className)}>{children}</ul>
}

export function PaginationItem({ children, className }: { children?: ReactNode, className?: string }) {
  return <li className={className}>{children}</li>
}

export interface PaginationLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  isActive?: boolean
  size?: 'default' | 'icon'
}

export function PaginationLink({ isActive, size = 'icon', children, className, ...rest }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive === true ? 'page' : undefined}
      data-active={isActive}
      className={clsx(css.link, size === 'icon' ? css.icon : undefined, isActive === true ? css.active : undefined, className)}
      {...rest}
    >
      {children}
    </a>
  )
}

export function PaginationPrevious({ children, className, ...rest }: PaginationLinkProps) {
  return (
    <PaginationLink aria-label="Go to previous page" size="default" className={className} {...rest}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      <span className={css.label}>{children ?? 'Previous'}</span>
    </PaginationLink>
  )
}

export function PaginationNext({ children, className, ...rest }: PaginationLinkProps) {
  return (
    <PaginationLink aria-label="Go to next page" size="default" className={className} {...rest}>
      <span className={css.label}>{children ?? 'Next'}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </PaginationLink>
  )
}

export function PaginationEllipsis({ label = 'More pages', className }: { label?: string, className?: string }) {
  return (
    <span aria-hidden className={clsx(css.ellipsis, className)}>
      <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="13" cy="8" r="1.3" fill="currentColor" /></svg>
      <span className={css.srOnly}>{label}</span>
    </span>
  )
}