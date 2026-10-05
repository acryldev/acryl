/**
 * The main panels DSH's own plugins contribute to its sidebar (the Plugins page, Automation tasks, and whatever a plugin adds), as the ACRYL left pane
 * lists them. DSH's sidebar draws these itself; ACRYL replaces that sidebar with the workspace tree, so without this the pages exist and cannot be opened.
 *
 * Read-only over the slot registry and one call on the layout: `entriesOfSlot('sidebar.panellist')` names each panel (its id is the keyed `main` panel it opens, its
 * label may be text or a function of the current language) and `layout.selectPanel(id)` opens it in the main column, which the advanced frame already shows.
 */

import type { MainPanelId } from '@acryl/ui/frame'

/** One panel as the left pane shows it. */
export interface UpstreamPanel {
  readonly id: MainPanelId
  readonly label: string
}

/** What the left pane needs: the list, when it changes, which panel is open, and how to open one. */
export interface UpstreamPanels {
  /** The pages, in order. Read through `useSyncExternalStore`, so it must return the SAME array until the list changes (a new array per call re-renders forever). */
  list(): readonly UpstreamPanel[]
  subscribe(listener: () => void): () => void
  /** The open panel, or null while the conversation (or the ACRYL workspace) is showing. */
  active(): MainPanelId | null
  /** Open a panel; selecting the one that is already open closes it and returns to the conversation. */
  select(id: MainPanelId): void
}

/** The slice of the registry this reads; `ctx.slots` provides it. */
export interface PanelSlotRegistry {
  entriesOfSlot(name: 'sidebar.panellist'): ReadonlyArray<{ readonly options: { readonly id?: unknown, readonly order?: number, readonly label?: string | (() => string) | undefined } }>
  subscribe(name: 'sidebar.panellist', listener: () => void): () => void
}

/** The slice of the layout service this uses. */
export interface PanelLayout {
  selectPanel(panelId: MainPanelId | null): void
  readonly panelInfo: { getSnapshot(): { readonly activePanelId: MainPanelId | null }, subscribe(listener: () => void): () => void }
}

const NO_PANELS: readonly UpstreamPanel[] = Object.freeze([])

/**
 * Build the panel list over a registry and a layout. Both are looked up on demand (`ctx.get` semantics): a profile without the sidebar plugin has no
 * registry entries and the list is simply empty, and a missing layout makes `select` do nothing instead of throwing.
 */
export function createUpstreamPanels(source: { slots(): PanelSlotRegistry | undefined, layout(): PanelLayout | undefined }): UpstreamPanels {
  let cached: readonly UpstreamPanel[] = NO_PANELS
  const read = (): readonly UpstreamPanel[] => {
    const entries = source.slots()?.entriesOfSlot('sidebar.panellist') ?? []
    const next = entries
      .filter((entry): entry is typeof entry & { options: { id: string } } => typeof entry.options.id === 'string' && entry.options.id !== '')
      .map(entry => ({ order: entry.options.order ?? 0, panel: { id: entry.options.id as MainPanelId, label: labelOf(entry.options.label) ?? entry.options.id } }))
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.panel)
    // A stable array while nothing changed, so a React subscriber does not re-render on every read.
    const same = next.length === cached.length && next.every((panel, index) => panel.id === cached[index]?.id && panel.label === cached[index]?.label)
    if (!same) cached = next.length === 0 ? NO_PANELS : next
    return cached
  }
  return {
    list: read,
    subscribe(listener) {
      const stops = [source.slots()?.subscribe('sidebar.panellist', listener), source.layout()?.panelInfo.subscribe(listener)]
      return () => { for (const stop of stops) stop?.() }
    },
    active: () => source.layout()?.panelInfo.getSnapshot().activePanelId ?? null,
    select(id) {
      const layout = source.layout()
      layout?.selectPanel(layout.panelInfo.getSnapshot().activePanelId === id ? null : id)
    },
  }
}

function labelOf(label: string | (() => string) | undefined): string | undefined {
  const text = typeof label === 'function' ? label() : label
  return text === undefined || text === '' ? undefined : text
}
