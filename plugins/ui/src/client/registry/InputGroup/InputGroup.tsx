/**
 * Ported from shadcn/ui's Input Group (https://ui.shadcn.com/docs/components/input-group, MIT licence, registry item `input-group`, style new-york-v4,
 * fetched 2026-09-22). An input or textarea with addons before, after, above or below it, inside one border that carries the focus ring and the error tint.
 *
 * This is the item the T040 note deliberately left unported: shadcn builds it out of its own Input, Textarea and Button items, and importing those files
 * across item boundaries is exactly the self-containment break this registry's ingest gate rejects. The dependency is resolved the same way
 * `ToggleGroupItem`, `PaginationLink` and `AttachmentAction` resolve theirs - the control and the addon button are plain elements styled locally, so the
 * item has no cross-item import and no new dependency. The source's `has-*` variant utilities become `:has()` selectors on the group, `group-data-[...]`
 * reach-across utilities become descendant selectors, and its `dark:` background utilities are dropped because the alias tokens carry both schemes.
 * `InputGroupAddon` keeps the source's click-to-focus behavior, which is what makes a prefix look like part of the field. See manifest.yml.
 */
import clsx from 'clsx'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import css from './InputGroup.module.css'

export type InputGroupAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end'
export type InputGroupButtonSize = 'xs' | 'sm' | 'icon-xs' | 'icon-sm'

export interface InputGroupProps {
  disabled?: boolean
  children?: ReactNode
  className?: string
}

/**
 * Render one bordered field that groups an input with its addons. The focus ring and the error tint live on this wrapper, so the control inside has none.
 * @param props - `disabled` (which dims the addons), and the control with its addons.
 * @returns the element.
 */
export function InputGroup({ disabled = false, children, className }: InputGroupProps) {
  return <div role="group" data-slot="input-group" data-disabled={disabled} className={clsx(css.inputGroup, className)}>{children}</div>
}

export interface InputGroupAddonProps {
  align?: InputGroupAlign
  children?: ReactNode
  className?: string
}

/** A prefix, suffix, or block above/below the control. Clicking it focuses the control beside it. */
export function InputGroupAddon({ align = 'inline-start', children, className }: InputGroupAddonProps) {
  const alignClass = align === 'inline-end' ? css.alignEnd : align === 'block-start' ? css.alignBlockStart : align === 'block-end' ? css.alignBlockEnd : css.alignStart
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={clsx(css.addon, alignClass, className)}
      onClick={event => {
        if (event.target instanceof HTMLElement && event.target.closest('button') !== null) return
        const group = event.currentTarget.parentElement
        if (group === null) return
        const control = group.querySelector('input, textarea')
        if (control instanceof HTMLElement) control.focus()
      }}
    >
      {children}
    </div>
  )
}

/** A small button inside an addon. `label` becomes the accessible name. */
export function InputGroupButton({ size = 'xs', label, onClick, children, className }: { size?: InputGroupButtonSize, label?: string, onClick?: () => void, children?: ReactNode, className?: string }) {
  const sizeClass = size === 'sm' ? css.buttonSmall : size === 'icon-sm' ? css.buttonIconLarge : size === 'icon-xs' ? css.buttonIconSmall : undefined
  return (
    <button type="button" data-size={size} aria-label={label} className={clsx(css.button, sizeClass, className)} onClick={onClick}>
      {children}
    </button>
  )
}

/** Muted text or an icon inside an addon. */
export function InputGroupText({ children, className }: { children?: ReactNode, className?: string }) {
  return <span className={clsx(css.text, className)}>{children}</span>
}

/** The control itself. It carries `data-slot='input-group-control'`, which is what the group's focus and invalid rules key off. */
export function InputGroupInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input-group-control" className={clsx(css.control, className)} {...rest} />
}

/** The multiline control, for a group whose addon sits above or below it. */
export function InputGroupTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea data-slot="input-group-control" className={clsx(css.textarea, className)} {...rest} />
}