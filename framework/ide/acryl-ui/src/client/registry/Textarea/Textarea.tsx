/**
 * Ported from shadcn/ui's Textarea (https://ui.shadcn.com/docs/components/textarea, MIT licence, registry item `textarea`, style new-york-v4, fetched
 * 2026-09-22). Tailwind utility classes replaced by a CSS Module on the app's own tokens. See manifest.yml.
 */
import clsx from 'clsx'
import css from './Textarea.module.css'

export interface TextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  className?: string
}

/**
 * Render a multi-line text input.
 * @param props - value, change handler and standard textarea options.
 * @returns the element.
 */
export function Textarea({ value, onChange, placeholder, disabled = false, rows = 3, className }: TextareaProps) {
  return (
    <textarea
      className={clsx(css.textarea, className)}
      value={value}
      onChange={(event) => { onChange(event.target.value) }}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
    />
  )
}
