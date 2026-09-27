// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../../src/client/palette/CommandPalette.tsx'
import { PaletteConfigState } from '../../src/client/palette/palette-config.ts'
import { PalettePanel } from '../../src/client/palette/PalettePanel.tsx'
import { DEFAULT_PALETTE_CONFIG, type PaletteItem } from '../../src/client/palette/palette-items.ts'
import { startPaletteShortcut } from '../../src/client/palette/palette-shortcut.ts'
import { PaletteState } from '../../src/client/palette/palette-state.ts'
import { WorkspaceTabRegistry } from '../../src/client/tabs/registry/tab-registry.ts'
import { TabTypesState } from '../../src/client/tabs/tab-types-state.ts'
import { TabsPanel } from '../../src/client/tabs/TabsPanel.tsx'

afterEach(cleanup)

const item = (id: string, title: string, over: Partial<PaletteItem> = {}): PaletteItem => ({ id, group: 'command', title, run: () => {}, ...over })

function setup() {
  const first = vi.fn()
  const second = vi.fn()
  const items = [item('a', 'New terminal', { run: first, shortcut: '⌘T' }), item('b', 'New browser tab', { run: second }), item('c', 'Open Claude', { group: 'agent', subtitle: 'Coding agent' })]
  const palette = new PaletteState({ items: () => items, config: () => DEFAULT_PALETTE_CONFIG, searchFiles: async () => [] })
  render(<CommandPalette palette={palette} />)
  return { palette, first, second }
}

describe('CommandPalette', () => {
  it('renders nothing while closed, then a dialog with grouped items, hints and the focused search box', () => {
    const { palette } = setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { palette.show() })
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Type a command or search' }))
    expect(screen.getByRole('group', { name: 'Commands' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Agents' })).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('⌘T')).toBeTruthy()
    expect(screen.getByText('Next scope')).toBeTruthy()
  })

  it('filters as you type and runs the highlighted item on Enter, closing itself', () => {
    const { palette, first, second } = setup()
    act(() => { palette.show() })
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'brow' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves with the arrow keys, switches scope with Tab, closes on Escape and on a click outside', () => {
    const { palette, first } = setup()
    act(() => { palette.show() })
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(screen.getByRole('tab', { name: 'Commands' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { palette.show() })
    fireEvent.pointerDown(document.querySelector('.dshPaletteOverlay') as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { palette.show() })
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing matches, and picks a scope by clicking its tab', () => {
    const { palette } = setup()
    act(() => { palette.show() })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z' } })
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'In files' }))
    expect(palette.getSnapshot().scope).toBe('content')
  })
})

describe('global shortcut', () => {
  it('toggles on Cmd+Shift+K, consumes the event, and stops when disposed', () => {
    const toggle = vi.fn()
    const stop = startPaletteShortcut(window, toggle)
    const press = (over: KeyboardEventInit) => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...over }); window.dispatchEvent(event); return event }
    const hit = press({ key: 'K', code: 'KeyK', metaKey: true, shiftKey: true })
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(hit.defaultPrevented).toBe(true)
    press({ key: 'k', code: 'KeyK', metaKey: true })
    expect(toggle).toHaveBeenCalledTimes(1)
    stop()
    press({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true })
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})

describe('Settings > Command palette', () => {
  it('hides a group and a single command, applies at once, and can reset', () => {
    const config = new PaletteConfigState(undefined)
    render(<PalettePanel config={config} />)
    const files = document.querySelector('[data-palette-group="file"]') as HTMLElement
    fireEvent.click(within(files).getByRole('radio', { name: 'Hidden' }))
    expect(config.getSnapshot().hiddenGroups).toEqual(['file'])
    const close = document.querySelector('[data-palette-item="command:close-tab"]') as HTMLElement
    fireEvent.click(within(close).getByRole('radio', { name: 'Hidden' }))
    expect(config.getSnapshot().hiddenItems).toEqual(['command:close-tab'])
    fireEvent.click(screen.getByRole('button', { name: 'Show everything again' }))
    expect(config.getSnapshot()).toEqual(DEFAULT_PALETTE_CONFIG)
  })
})

describe('Settings > Tabs', () => {
  it('lists every tab type, keeps the terminal on, and toggles the rest through the shared state', () => {
    const tabTypes = new TabTypesState(undefined)
    render(<TabsPanel tabTypes={tabTypes} tabRegistry={new WorkspaceTabRegistry()} />)
    expect(screen.getByLabelText('The terminal is always on')).toBeTruthy()
    const board = document.querySelector('[data-tab-type="kanban"]') as HTMLElement
    fireEvent.click(within(board).getByRole('radio', { name: 'Disabled' }))
    expect(tabTypes.isEnabled('kanban')).toBe(false)
    expect(within(board).getByRole('radio', { name: 'Disabled' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(board).getByRole('radio', { name: 'Enabled' }))
    expect(tabTypes.isEnabled('kanban')).toBe(true)
    expect(screen.getByText(/ctx.workspaceTabs.register/)).toBeTruthy()
  })
})
