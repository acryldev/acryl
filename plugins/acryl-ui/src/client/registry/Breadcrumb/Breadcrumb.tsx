/**
 * Ported from shadcn/ui's Breadcrumb (https://ui.shadcn.com/docs/components/breadcrumb, MIT licence, registry item `breadcrumb`, style new-york-v4,
 * fetched 2026-09-22). Tailwind utility classes replaced by a CSS Module on the app's own tokens; `asChild`/Slot (a Radix dependency) dropped from
 * BreadcrumbLink - render your own `<a>` if you need a non-anchor link. lucide-react's ChevronRight/MoreHorizontal replaced by plain inline SVGs (no
 * new dependency). See manifest.yml.
 */
import clsx from 'clsx'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import css from './Breadcrumb.module.css'

export function Breadcrumb({ children }: { children?: ReactNode }) {
  return <nav aria-label="breadcrumb">{children}</nav>
}
export function BreadcrumbList({ children }: { children?: ReactNode }) {
  return <ol className={css.list}>{children}</ol>
}
export function BreadcrumbItem({ children }: { children?: ReactNode }) {
  return <li className={css.item}>{children}</li>
}
export function BreadcrumbLink({ children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={css.link} {...rest}>{children}</a>
}
export function BreadcrumbPage({ children }: { children?: ReactNode }) {
  return <span role="link" aria-disabled="true" aria-current="page" className={css.page}>{children}</span>
}
export function BreadcrumbSeparator({ children }: { children?: ReactNode }) {
  return (
    <li role="presentation" aria-hidden className={css.separator}>
      {children ?? <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>}
    </li>
  )
}
export function BreadcrumbEllipsis({ label = 'More' }: { label?: string }) {
  return (
    <span role="presentation" aria-hidden className={clsx(css.item, css.ellipsis)}>
      <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="13" cy="8" r="1.3" fill="currentColor" /></svg>
      <span className={css.srOnly}>{label}</span>
    </span>
  )
}
