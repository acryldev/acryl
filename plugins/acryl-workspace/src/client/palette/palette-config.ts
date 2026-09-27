/** The palette's configuration: parsed at the boundary, kept in browser storage, observable. */

import { DEFAULT_PALETTE_CONFIG, PALETTE_GROUPS, type PaletteConfig, type PaletteGroup } from './palette-items.ts'

export const PALETTE_CONFIG_KEY = 'acryl-workspace:palette'

type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>

const isGroup = (value: unknown): value is PaletteGroup => (PALETTE_GROUPS as readonly unknown[]).includes(value)

/** @param raw - the stored text; anything unreadable gives the defaults. */
export function parsePaletteConfig(raw: string | null | undefined): PaletteConfig {
  if (raw === null || raw === undefined) return DEFAULT_PALETTE_CONFIG
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_PALETTE_CONFIG
    const { hiddenGroups, hiddenItems } = value as Record<string, unknown>
    return {
      hiddenGroups: Array.isArray(hiddenGroups) ? hiddenGroups.filter(isGroup) : [],
      hiddenItems: Array.isArray(hiddenItems) ? hiddenItems.filter((id): id is string => typeof id === 'string' && id.length <= 200).slice(0, 500) : [],
    }
  } catch {
    return DEFAULT_PALETTE_CONFIG
  }
}

/** Shared by the palette and Settings > Command palette, so a change shows up in both at once. */
export class PaletteConfigState {
  private config: PaletteConfig
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: (Reader & Partial<Writer>) | undefined) {
    let raw: string | null = null
    try { raw = storage?.getItem(PALETTE_CONFIG_KEY) ?? null } catch { raw = null }
    this.config = parsePaletteConfig(raw)
  }

  getSnapshot = (): PaletteConfig => this.config

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggleGroup(group: PaletteGroup): void {
    const hidden = this.config.hiddenGroups.includes(group)
    this.set({ ...this.config, hiddenGroups: hidden ? this.config.hiddenGroups.filter(g => g !== group) : [...this.config.hiddenGroups, group] })
  }

  toggleItem(id: string): void {
    const hidden = this.config.hiddenItems.includes(id)
    this.set({ ...this.config, hiddenItems: hidden ? this.config.hiddenItems.filter(item => item !== id) : [...this.config.hiddenItems, id] })
  }

  reset(): void {
    this.set(DEFAULT_PALETTE_CONFIG)
  }

  private set(next: PaletteConfig): void {
    this.config = next
    try { this.storage?.setItem?.(PALETTE_CONFIG_KEY, JSON.stringify(next)) } catch { /* a convenience: not remembered when storage is blocked */ }
    for (const listener of [...this.listeners]) listener()
  }
}
