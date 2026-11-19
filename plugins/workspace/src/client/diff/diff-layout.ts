/** The remembered diff layout: one column ("unified") or old next to new ("split"). */

export type DiffLayout = 'unified' | 'split'

const KEY = 'acryl-workspace:diff-layout'

export function readDiffLayout(storage: Pick<Storage, 'getItem'> | undefined): DiffLayout {
  try {
    return storage?.getItem(KEY) === 'split' ? 'split' : 'unified'
  } catch {
    return 'unified'
  }
}

export function writeDiffLayout(storage: Pick<Storage, 'setItem'> | undefined, layout: DiffLayout): void {
  try {
    storage?.setItem(KEY, layout)
  } catch {
    // Storage can be blocked or full; the layout then resets on the next start.
  }
}
