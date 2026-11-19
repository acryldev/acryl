/** DSH's own left sidebar: when it is in the page it declares the `sidebar.settings` seat itself. */
export const DSH_SIDEBAR_ENTRY = '@deepseek-ai/dsh-client-ui-sidebar'

/** One loader entry as the seat decision reads it: the row's options, plus its effective disabled state (its own or an owning group's). */
export interface SettingsSeatEntry {
  readonly options: { readonly name: string, readonly disabled?: boolean | null }
  /** The loader Entry's effective state (`entry.disabled`), which includes a disabled parent group; absent on a plain test stand-in. */
  readonly disabled?: boolean
}

/**
 * Whether the advanced root declares DSH's `sidebar.settings` seat itself: only when DSH's own left sidebar, which declares it, is not
 * composed, or is composed and disabled. The entry is read, never its fiber: an enabled entry that has not activated yet still declares the
 * seat when it does, so "no fiber" is not "absent".
 */
export function rootOwnsSettingsSeat(entries: Iterable<SettingsSeatEntry>): boolean {
  for (const entry of entries) {
    if (entry.options.name !== DSH_SIDEBAR_ENTRY) continue
    const disabled = entry.disabled ?? entry.options.disabled === true
    if (!disabled) return false
  }
  return true
}
