/**
 * Ported from shadcn/ui's Native Select (https://ui.shadcn.com/docs/components/native-select, MIT licence, registry item `native-select`, style
 * new-york-v4, fetched 2026-09-22). A styled native `<select>`, deliberately not the same thing as this library's `SelectField` (which opens a
 * menu over the app's `Menu`): this one keeps the platform's own dropdown, its keyboard behavior and its typeahead for free, and is the right
 * control for a short, static option list inside a form. Tailwind utility classes replaced by a CSS Module on the app's own tokens; the source's
 * icon slot (an `IconPlaceholder` over five icon sets) becomes one plain inline SVG (no new dependency); its `dark:` variant utilities are dropped
 * rather than reproduced, because this library's contract is that the alias tokens carry both schemes (no theme selectors in a module - the ingest
 * gate rejects them). The source's `NativeSelectOption`/`NativeSelectOptGroup` only added `bg-[Canvas] text-[CanvasText]`; those wrappers are
 * kept so callers keep the same import shape, but they deliberately add nothing, leaving the popup to the platform's own color-scheme handling.
 * See manifest.yml.
 */
import clsx from 'clsx'
import type { OptgroupHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react'
import css from './NativeSelect.module.css'

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'default'
}

/**
 * Render the platform's own select, styled to match this library's inputs.
 * @param props - normal `<select>` attributes plus a `size` of `sm` or `default`.
 * @returns the element.
 */
export function NativeSelect({ size = 'default', className, children, ...rest }: NativeSelectProps) {
  return (
    <div data-size={size} className={css.wrapper}>
      <select className={clsx(css.select, size === 'sm' ? css.small : undefined, className)} {...rest}>{children}</select>
      <svg className={css.icon} viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
    </div>
  )
}

export function NativeSelectOption({ className, children, ...rest }: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option className={className} {...rest}>{children}</option>
}

export function NativeSelectOptGroup({ className, children, ...rest }: OptgroupHTMLAttributes<HTMLOptGroupElement>) {
  return <optgroup className={className} {...rest}>{children}</optgroup>
}