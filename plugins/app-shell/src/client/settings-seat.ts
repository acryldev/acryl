/** Whether the advanced root declares DSH's `sidebar.settings` seat itself: only when DSH's own left sidebar, which declares it, is not composed. */
export function rootOwnsSettingsSeat(entries: Iterable<{ readonly options: { readonly name: string, readonly disabled?: boolean | null } }>): boolean {
  for (const entry of entries) if (entry.options.name === '@deepseek-ai/dsh-client-ui-sidebar' && entry.options.disabled !== true) return false
  return true
}
