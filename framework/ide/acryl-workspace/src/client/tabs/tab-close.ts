/** Which tabs "Close others" and "Close to the right" mean. */

export type CloseScope = 'others' | 'right'

/** @returns the ids to close, in tab order; the tab the menu was opened on is never among them. */
export function tabsToClose(tabIds: readonly string[], anchorId: string, scope: CloseScope): readonly string[] {
  const anchor = tabIds.indexOf(anchorId)
  if (anchor === -1) return []
  return scope === 'others' ? tabIds.filter(id => id !== anchorId) : tabIds.slice(anchor + 1)
}
