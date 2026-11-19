/**
 * Ported from shadcn/ui's Scroll Area (https://ui.shadcn.com/docs/components/scroll-area, MIT licence, registry item `scroll-area`, style
 * new-york-v4, fetched 2026-09-22). Radix's `Root`/`Viewport`/`ScrollAreaScrollbar`/`Thumb`/`Corner` are dropped: the platform's own scroller already
 * does what Radix reimplements in JavaScript, so the viewport keeps `overflow: auto` and the module styles the real scrollbar with the app's
 * `--dsw-alias-scrollbar-*` tokens. `ScrollBar` is therefore not exported - a separate thumb element would be decoration with no behaviour behind it,
 * the same call this library made for `KbdGroup`. `overscroll-behavior: contain` replaces Radix's scroll-chaining guard. See manifest.yml.
 */
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import css from './ScrollArea.module.css'

export type ScrollAreaProps = HTMLAttributes<HTMLDivElement>

/**
 * Render a scroll container that stays inside its own box: its scrollbars are the platform's, styled, and reaching an end does not scroll the page behind it.
 *
 * Give it a definite height, the way the source's own examples do (Radix's Root needs one too, which is why the source's Root takes full div props - and why
 * this port must as well: a scroller whose height a caller cannot set is a scroller that silently grows instead of scrolling).
 * @param props - normal `<div>` attributes; `className` and `style` land on the scroll root, which is the element that needs the height.
 * @returns the element.
 */
export function ScrollArea({ children, className, ...rest }: ScrollAreaProps) {
  return (
    <div data-slot="scroll-area" className={clsx(css.root, className)} {...rest}>
      <div data-slot="scroll-area-viewport" tabIndex={0} className={css.viewport}>{children}</div>
    </div>
  )
}