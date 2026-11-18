/**
 * The React binding: one hook that reads a cell and re-renders when it changes. `useSyncExternalStore` is React's own
 * contract for exactly this, so it is tear-free under concurrent rendering. Import from `acryl-state/react`.
 */

import { useSyncExternalStore } from 'react'
import type { ReadonlyCell } from './cell.ts'

export function useCell<T>(cell: ReadonlyCell<T>): T {
  return useSyncExternalStore(listener => cell.subscribe(listener), cell.get, cell.get)
}
