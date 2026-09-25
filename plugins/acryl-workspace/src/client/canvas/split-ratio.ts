/** Pure maths and storage for the width ratio of the canvas split. Kept apart from React so it is unit-tested. */

export const SPLIT_MIN = 0.2
export const SPLIT_MAX = 0.8
export const SPLIT_DEFAULT = 0.5
/** One arrow-key press on the divider moves this fraction of the stage width. */
export const SPLIT_KEY_STEP = 0.05
const STORAGE_KEY = 'acryl-workspace:split-ratio'

/** Clamp to the allowed range; anything that is not a finite number falls back to an even split. */
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return SPLIT_DEFAULT
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value))
}

/** The primary pane's share of the stage for a pointer at `clientX`, given the stage's box. */
export function ratioFromPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return SPLIT_DEFAULT
  return clampSplit((clientX - left) / width)
}

export function readSplitRatio(storage: Pick<Storage, 'getItem'> | undefined): number {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined) return SPLIT_DEFAULT
    return clampSplit(Number(raw))
  } catch {
    return SPLIT_DEFAULT
  }
}

export function writeSplitRatio(storage: Pick<Storage, 'setItem'> | undefined, ratio: number): void {
  try {
    storage?.setItem(STORAGE_KEY, String(clampSplit(ratio)))
  } catch {
    // Storage can be unavailable or full; the ratio then just resets on the next start.
  }
}
