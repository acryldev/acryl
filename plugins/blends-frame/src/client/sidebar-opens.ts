/**
 * DSH's right sidebar (`dsh-client-ui-sidebar-right`) is drawn in the right panel's Panel tab. When something opens a page in it (a Plan card's button,
 * a file of a turn's changes, a file an answer names) the person has to see it, so the Panel tab comes forward. The layout only says whether the sidebar
 * is shown, which does not change when it already is; what changes on every open is the opened tab's navigation record, whose `revision` DSH increments
 * on each navigation to it (`SidebarRightTabNavigation`), including a page that was already open.
 */

/** The part of DSH's `SidebarRightController` an open is read from. */
export interface SidebarRightOpens {
  /** Every open tab of every session, published on each change. */
  readonly openTabs: {
    getSnapshot(): readonly { readonly sessionId: string; readonly tabId: string }[]
    subscribe(listener: () => void): () => void
  }
  readonly tabDomain: {
    /** @throws while the tab has no navigation record yet (it is being opened, or its session is not on screen). */
    occurrence(sessionId: string, tab: { readonly id: string }): {
      readonly navigation: { getSnapshot(): { readonly revision: number }; subscribe(listener: () => void): () => void }
    }
  }
}

/**
 * Call `opened` on every open in the sidebar after this call. The tabs already there, and those a session brings back from its saved layout (revision 0),
 * are not opens.
 * @returns the disposer.
 */
export function watchSidebarOpens(sidebar: SidebarRightOpens, opened: () => void): () => void {
  const watched = new Map<string, { revision: number; readonly stop: () => void }>()
  let first = true
  let retry = false
  let disposed = false
  const sync = (): void => {
    if (disposed) return
    const present = new Set<string>()
    let missing = false
    for (const tab of sidebar.openTabs.getSnapshot()) {
      const key = `${tab.sessionId}\u0000${tab.tabId}`
      present.add(key)
      if (watched.has(key)) continue
      let navigation
      try {
        navigation = sidebar.tabDomain.occurrence(tab.sessionId, { id: tab.tabId }).navigation
      } catch {
        missing = true
        continue
      }
      const entry = {
        revision: navigation.getSnapshot().revision,
        stop: navigation.subscribe(() => {
          const revision = navigation.getSnapshot().revision
          if (revision <= entry.revision) return
          entry.revision = revision
          opened()
        }),
      }
      watched.set(key, entry)
      if (!first && entry.revision > 0) opened()
    }
    for (const [key, entry] of watched) {
      if (present.has(key)) continue
      entry.stop()
      watched.delete(key)
    }
    first = false
    // A tab being opened is in the list a moment before its record: look once more after this change settles.
    if (missing && !retry) {
      retry = true
      queueMicrotask(() => { sync(); retry = false })
    }
  }
  const stop = sidebar.openTabs.subscribe(sync)
  sync()
  return () => {
    disposed = true
    stop()
    for (const entry of watched.values()) entry.stop()
    watched.clear()
  }
}
