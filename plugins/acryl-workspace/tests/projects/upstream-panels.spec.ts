import { describe, expect, it, vi } from 'vitest'
import type { MainPanelId } from '@acryl/ui/frame'
import { createUpstreamPanels, type PanelLayout, type PanelSlotRegistry } from '../../src/client/projects/upstream-panels.ts'

type Entry = { options: { id?: unknown, order?: number, label?: string | (() => string) } }

function registry(entries: Entry[]): PanelSlotRegistry & { change(): void } {
  const listeners = new Set<() => void>()
  return {
    entriesOfSlot: () => entries,
    subscribe: (_name, listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    change: () => { for (const listener of listeners) listener() },
  }
}

function layout(initial: MainPanelId | null = null): PanelLayout & { open: MainPanelId | null, selected: Array<MainPanelId | null> } {
  const listeners = new Set<() => void>()
  const state = { open: initial, selected: [] as Array<MainPanelId | null> }
  return Object.assign(state, {
    selectPanel(id: MainPanelId | null) { state.selected.push(id); state.open = id; for (const listener of listeners) listener() },
    panelInfo: { getSnapshot: () => ({ activePanelId: state.open }), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
  })
}

describe('the upstream panels the left pane lists', () => {
  it('lists each panel by order with its label, resolving a label that is a function of the language', () => {
    let language = 'en'
    const slots = registry([
      { options: { id: 'automation', order: 5, label: 'Automation tasks' } },
      { options: { id: 'plugins', order: 0, label: () => (language === 'en' ? 'Plugins' : '插件') } },
    ])
    const panels = createUpstreamPanels({ slots: () => slots, layout: () => undefined })
    expect(panels.list()).toEqual([{ id: 'plugins', label: 'Plugins' }, { id: 'automation', label: 'Automation tasks' }])
    language = 'zh'
    expect(panels.list().map(panel => panel.label)).toEqual(['插件', 'Automation tasks'])
  })

  it('falls back to the id for a panel without a label and ignores an entry without an id', () => {
    const slots = registry([{ options: { id: 'notes' } }, { options: { label: 'No id' } }, { options: { id: '', label: 'Empty id' } }])
    expect(createUpstreamPanels({ slots: () => slots, layout: () => undefined }).list()).toEqual([{ id: 'notes', label: 'notes' }])
  })

  it('returns the same array while nothing changed, so a subscriber does not re-render on every read', () => {
    const slots = registry([{ options: { id: 'plugins', label: 'Plugins' } }])
    const panels = createUpstreamPanels({ slots: () => slots, layout: () => undefined })
    expect(panels.list()).toBe(panels.list())
  })

  it('is empty, and does nothing on select, when the profile has no sidebar or no layout', () => {
    const panels = createUpstreamPanels({ slots: () => undefined, layout: () => undefined })
    expect(panels.list()).toEqual([])
    expect(panels.active()).toBeNull()
    expect(() => { panels.select('plugins' as MainPanelId) }).not.toThrow()
    expect(() => { panels.subscribe(() => {})() }).not.toThrow()
  })

  it('opens a panel through the layout and reports which one is open', () => {
    const slots = registry([{ options: { id: 'plugins', label: 'Plugins' } }])
    const place = layout()
    const panels = createUpstreamPanels({ slots: () => slots, layout: () => place })
    expect(panels.active()).toBeNull()
    panels.select('plugins' as MainPanelId)
    expect(place.selected).toEqual(['plugins'])
    expect(panels.active()).toBe('plugins')
  })

  it('closes the open panel when its own entry is selected again, and switches when another is selected', () => {
    const slots = registry([{ options: { id: 'plugins', label: 'Plugins' } }, { options: { id: 'automation', label: 'Automation tasks' } }])
    const place = layout()
    const panels = createUpstreamPanels({ slots: () => slots, layout: () => place })
    panels.select('plugins' as MainPanelId)
    panels.select('automation' as MainPanelId)
    expect(panels.active()).toBe('automation')
    panels.select('automation' as MainPanelId)
    expect(panels.active()).toBeNull()
    expect(place.selected).toEqual(['plugins', 'automation', null])
  })

  it('tells a subscriber when the registry or the open panel changes, and stops after unsubscribe', () => {
    const slots = registry([{ options: { id: 'plugins', label: 'Plugins' } }])
    const place = layout()
    const panels = createUpstreamPanels({ slots: () => slots, layout: () => place })
    const listener = vi.fn()
    const stop = panels.subscribe(listener)
    slots.change()
    panels.select('plugins' as MainPanelId)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    slots.change()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
