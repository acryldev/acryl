/** What the palette lists, and how a query ranks it. Pure rules; the sources that produce items live elsewhere. */

import { scoreFields } from './fuzzy.ts'

/** In display order. */
export const PALETTE_GROUPS = ['command', 'agent', 'tab', 'worktree', 'setting', 'file'] as const
export type PaletteGroup = (typeof PALETTE_GROUPS)[number]

export const GROUP_LABELS: Readonly<Record<PaletteGroup, string>> = {
  command: 'Commands',
  agent: 'Agents',
  tab: 'Open tabs',
  worktree: 'Worktrees',
  setting: 'Settings',
  file: 'Files',
}

export interface PaletteItem {
  /** Stable across sessions (a configuration hides an item by this id). */
  readonly id: string
  readonly group: PaletteGroup
  readonly title: string
  readonly subtitle?: string
  /** Extra words that should find this item. */
  readonly keywords?: readonly string[]
  /** Shown at the right, for example `⌘⇧K`. */
  readonly shortcut?: string
  run(): void
}

/** What the user chose to see (Settings > Command palette). */
export interface PaletteConfig {
  readonly hiddenGroups: readonly PaletteGroup[]
  readonly hiddenItems: readonly string[]
}

export const DEFAULT_PALETTE_CONFIG: PaletteConfig = { hiddenGroups: [], hiddenItems: [] }

export function isVisible(item: PaletteItem, config: PaletteConfig): boolean {
  return !config.hiddenGroups.includes(item.group) && !config.hiddenItems.includes(item.id)
}

/** With no query everything is listed in group order; with one, the best matches first, capped. */
export const MAX_RESULTS = 60

/**
 * @param items - every item from every source.
 * @param query - what the user typed.
 * @param config - the user's hidden groups and items.
 * @returns the items to show, ranked.
 */
export function rankItems(items: readonly PaletteItem[], query: string, config: PaletteConfig): PaletteItem[] {
  const groupOrder = (item: PaletteItem): number => PALETTE_GROUPS.indexOf(item.group)
  const visible = items.filter(item => isVisible(item, config))
  if (query.trim() === '') return [...visible].sort((a, b) => groupOrder(a) - groupOrder(b)).slice(0, MAX_RESULTS)
  const scored: Array<{ readonly item: PaletteItem; readonly score: number }> = []
  for (const item of visible) {
    const score = scoreFields(query, [item.title, item.subtitle ?? '', ...(item.keywords ?? [])])
    if (score !== null) scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || groupOrder(a.item) - groupOrder(b.item) || a.item.title.localeCompare(b.item.title))
  return scored.slice(0, MAX_RESULTS).map(entry => entry.item)
}

export interface PaletteSection {
  readonly group: PaletteGroup
  readonly label: string
  readonly items: readonly PaletteItem[]
}

/** Groups ranked items for display, keeping the ranked order inside each group and the group order of first appearance when searching. */
export function sectionsOf(ranked: readonly PaletteItem[], searching: boolean): PaletteSection[] {
  const order: PaletteGroup[] = []
  const byGroup = new Map<PaletteGroup, PaletteItem[]>()
  for (const item of ranked) {
    const list = byGroup.get(item.group)
    if (list === undefined) { byGroup.set(item.group, [item]); order.push(item.group) } else list.push(item)
  }
  const groups = searching ? order : PALETTE_GROUPS.filter(group => byGroup.has(group))
  return groups.map(group => ({ group, label: GROUP_LABELS[group], items: byGroup.get(group) ?? [] }))
}
