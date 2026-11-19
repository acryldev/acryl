/**
 * Ported from shadcn/ui's Table (https://ui.shadcn.com/docs/components/table, MIT licence, registry item `table`, style new-york-v4, fetched
 * 2026-09-22). Tailwind utility classes replaced by a CSS Module on the app's own tokens; `cn()` replaced by `clsx`. The source's descendant
 * utilities (`[&_tr]:border-b`, `[&_tr:last-child]:border-0`) become plain descendant selectors inside the module, and `bg-muted/50` becomes the
 * app's own `--dsw-alias-interactive-bg-hover`. The source wraps every table in its own scroll container, kept as-is. No Radix primitive is
 * involved - a table needs no interactive behavior - so nothing was dropped. The doc site's "Data Table" page is a composition guide over this
 * item plus a data library, not a component of its own. See manifest.yml.
 */
import clsx from 'clsx'
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'
import css from './Table.module.css'

/**
 * Render a table inside its own horizontal scroll container.
 * @param props - normal `<table>` attributes; `className` lands on the table itself, not the container.
 * @returns the element.
 */
export function Table({ className, children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={css.container}>
      <table className={clsx(css.table, className)} {...rest}>{children}</table>
    </div>
  )
}

export function TableHeader({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx(css.header, className)} {...rest}>{children}</thead>
}

export function TableBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={clsx(css.body, className)} {...rest}>{children}</tbody>
}

export function TableFooter({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={clsx(css.footer, className)} {...rest}>{children}</tfoot>
}

export function TableRow({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx(css.row, className)} {...rest}>{children}</tr>
}

export function TableHead({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={clsx(css.head, className)} {...rest}>{children}</th>
}

export function TableCell({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx(css.cell, className)} {...rest}>{children}</td>
}

export function TableCaption({ className, children, ...rest }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={clsx(css.caption, className)} {...rest}>{children}</caption>
}