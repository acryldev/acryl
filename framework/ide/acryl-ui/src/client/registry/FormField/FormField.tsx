/**
 * Ported from shadcn/ui's Field (https://ui.shadcn.com/docs/components/field, MIT licence, registry item `field`, style new-york-v4, fetched 2026-09-22).
 * The layout around one field's parts: set, group, legend, label, title, content, description, separator and error, in vertical, horizontal or
 * container-responsive orientation.
 *
 * Renamed to `FormField` because this library already exports a `Field` - the labelled-input adapter in contract-adapters - and a port that took the same
 * name would collide with it. The sub-part names (FieldSet, FieldGroup, FieldLabel, ...) are unchanged and collide with nothing. Precedent for renaming a
 * port to this library's vocabulary: Badge's variants took this library's own roles, and `markerVariants` was not exported at all.
 *
 * `FieldLabel` is built on shadcn's own Label item and `FieldSeparator` on its own Separator item in the source; importing those files across item
 * boundaries is the self-containment break this registry's gate rejects, so both are plain elements styled locally - the `ToggleGroupItem` /
 * `PaginationLink` / `ItemSeparator` precedent. The source's `data-[variant=...]` and `group-data-[...]` utilities become attribute and descendant
 * selectors, and `@container/field-group` + `@md/field-group:` become a real container query inside the module. Two small API additions are documented
 * rather than hidden: `invalid` and `disabled` set the `data-invalid`/`data-disabled` attributes the source's own styles key off but expect the caller to
 * set. The source's `[&>.sr-only]:w-auto` accommodation for a Tailwind-hidden label has no equivalent here (a consumer cannot reach a hashed module
 * class), so it is not carried over. See manifest.yml.
 */
import { useMemo } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './FormField.module.css'

export type FormFieldOrientation = 'vertical' | 'horizontal' | 'responsive'
export type FieldLegendVariant = 'legend' | 'label'

export interface FormFieldProps {
  orientation?: FormFieldOrientation
  invalid?: boolean
  disabled?: boolean
  children?: ReactNode
  className?: string
}

/**
 * Render one field. `horizontal` puts the label beside the control; `responsive` does that only once its `FieldGroup` is at least 28rem wide.
 * @param props - the orientation, whether the field is invalid (which tints it) or disabled (which dims its label), and the field's parts.
 * @returns the element.
 */
export function FormField({ orientation = 'vertical', invalid = false, disabled = false, children, className }: FormFieldProps) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      data-invalid={invalid}
      data-disabled={disabled}
      className={clsx(css.field, orientation === 'horizontal' ? css.horizontal : orientation === 'responsive' ? css.responsive : css.vertical, className)}
    >
      {children}
    </div>
  )
}

/** A `<fieldset>` grouping related fields. */
export function FieldSet({ children, className }: { children?: ReactNode, className?: string }) {
  return <fieldset data-slot="field-set" className={clsx(css.set, className)}>{children}</fieldset>
}

/** The `<legend>` of a `FieldSet`. */
export function FieldLegend({ variant = 'legend', children, className }: { variant?: FieldLegendVariant, children?: ReactNode, className?: string }) {
  return <legend data-slot="field-legend" data-variant={variant} className={clsx(css.legend, className)}>{children}</legend>
}

/** Groups fields, and is the container `responsive` orientation measures itself against. */
export function FieldGroup({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="field-group" className={clsx(css.group, className)}>{children}</div>
}

export function FieldContent({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="field-content" className={clsx(css.content, className)}>{children}</div>
}

/** The label for the control, styled locally rather than importing this library's Label item. */
export function FieldLabel({ children, className }: { children?: ReactNode, className?: string }) {
  return <label data-slot="field-label" className={clsx(css.label, className)}>{children}</label>
}

/** A label-shaped heading that is not bound to a control. The source gives this the label's slot attribute too, reproduced here so consumer selectors keyed off it keep working. */
export function FieldTitle({ children, className }: { children?: ReactNode, className?: string }) {
  return <div data-slot="field-label" className={clsx(css.title, className)}>{children}</div>
}

export function FieldDescription({ children, className }: { children?: ReactNode, className?: string }) {
  return <p data-slot="field-description" className={clsx(css.description, className)}>{children}</p>
}

/** A rule between field groups, optionally labelled. */
export function FieldSeparator({ children, className }: { children?: ReactNode, className?: string }) {
  return (
    <div data-slot="field-separator" data-content={children !== undefined && children !== null} className={clsx(css.separator, className)}>
      {children !== undefined && children !== null && <span data-slot="field-separator-content" className={css.separatorContent}>{children}</span>}
    </div>
  )
}

export interface FieldErrorProps {
  errors?: Array<{ message?: string } | undefined>
  children?: ReactNode
  className?: string
}

/**
 * Render a field's error. With `children` it renders them as given; with `errors` it renders one message, or a list of the distinct ones.
 * @param props - the messages, or the content to render directly.
 * @returns the element, or nothing when there is no error to show.
 */
export function FieldError({ errors, children, className }: FieldErrorProps) {
  const content = useMemo(() => {
    if (children !== undefined && children !== null) return children
    if (errors === undefined || errors.length === 0) return null
    const unique = [...new Map(errors.map(error => [error?.message, error])).values()]
    if (unique.length === 1) return unique[0]?.message
    return (
      <ul className={css.errorList}>
        {unique.map((error, index) => error?.message !== undefined && <li key={index}>{error.message}</li>)}
      </ul>
    )
  }, [children, errors])

  if (content === null || content === undefined || content === false) return null
  return <div role="alert" data-slot="field-error" className={clsx(css.error, className)}>{content}</div>
}