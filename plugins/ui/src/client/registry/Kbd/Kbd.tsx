/**
 * Ported from shadcn/ui's Kbd (https://ui.shadcn.com/docs/components/kbd, MIT licence, registry item `kbd`, style `new-york-v4`, fetched 2026-09-22).
 * Tailwind utility classes replaced by a CSS Module on the app's own tokens (`--dsw-alias-bg-layer-2`, `--dsw-alias-label-tertiary`); `cn()` replaced by `clsx`. `KbdGroup` is not
 * ported: use this library's own `Stack` (`direction: 'row', gap: 'xs'`) for grouping instead of a second wrapper. See manifest.yml.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './Kbd.module.css'

export interface KbdProps {
  children?: ReactNode
  className?: string
}

/**
 * Render one keyboard key or shortcut segment.
 * @param props - the key's label and an optional extra class.
 * @returns the element.
 */
export function Kbd({ children, className }: KbdProps) {
  return <kbd className={clsx(css.kbd, className)}>{children}</kbd>
}
