/**
 * Ported from shadcn/ui's Direction (https://ui.shadcn.com/docs/components/direction, MIT licence, registry item `direction`, style new-york-v4,
 * fetched 2026-09-22). Radix's `Direction.DirectionProvider` and `useDirection` are dropped and reproduced with a plain `createContext`: text
 * direction is one string, so the provider needs no behavior of its own and the public API stays the same (`dir`, the source's `direction` alias,
 * and a `useDirection()` hook). The source's provider requires `dir`; here it defaults to `ltr`, which is what Radix itself falls back to. This
 * item has no stylesheet - a direction carries no styling - so there is no `.module.css` beside it. See manifest.yml.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export type Direction = 'ltr' | 'rtl'

const DirectionContext = createContext<Direction>('ltr')

export interface DirectionProviderProps {
  dir?: Direction
  direction?: Direction
  children?: ReactNode
}

/**
 * Provide a text direction to every descendant (and, through Radix's own behavior in the source, to portals - those are the app's concern here).
 * @param props - `dir`, or the source's `direction` alias, and the subtree.
 * @returns the element.
 */
export function DirectionProvider({ dir, direction, children }: DirectionProviderProps) {
  return <DirectionContext.Provider value={direction ?? dir ?? 'ltr'}>{children}</DirectionContext.Provider>
}

/**
 * Read the direction set by the nearest `DirectionProvider`.
 * @returns `ltr` when no provider is above this component, matching Radix's default.
 */
export function useDirection(): Direction {
  return useContext(DirectionContext)
}