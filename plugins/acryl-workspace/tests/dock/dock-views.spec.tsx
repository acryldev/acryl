// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DockButtons, toggleDock, type RightPaneHandle } from '../../src/client/dock/DockButtons.tsx'
import { CenterColumn, RightColumn } from '../../src/client/dock/DockColumns.tsx'
import type { DockHost } from '../../src/client/dock/dock-host.ts'
import { TerminalDockPanel } from '../../src/client/dock/TerminalDockPanel.tsx'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'
import { makeDock } from './dock-fixtures.ts'

class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver
afterEach(cleanup)

function setup() {
  const stack = makeDock()
  const shell = new WorkspaceShellState({ repo: async () => { throw new Error('none') }, status: async () => { throw new Error('none') } } as never)
  const host: DockHost = { controller: stack.controller, terminals: stack.terminals, shell }
  return { ...stack, host }
}

describe('TerminalDockPanel', () => {
  it('starts a first terminal when opened empty, shows the tabs, adds and closes them, and renames on double click', async () => {
    const { host, controller, pty } = setup()
    render(<TerminalDockPanel host={host} groupKey="" cwd={undefined} onHide={() => {}} />)
    await waitFor(() => { expect(pty.started).toHaveLength(1) })
    expect(await screen.findByRole('tab', { name: 'Terminal' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => { expect(screen.getByRole('tab', { name: 'Terminal 2' })).toBeTruthy() })
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Terminal 2' }))
    const input = screen.getByLabelText('Rename Terminal 2')
    fireEvent.change(input, { target: { value: 'build' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('tab', { name: 'build' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close build' }))
    await waitFor(() => { expect(controller.groups.stateFor('').getSnapshot().tabs).toHaveLength(1) })
    expect(pty.closed).toEqual(['term-2'])
  })

  it('does not start another terminal after the last one is closed, offers to start one, and hides on request', async () => {
    const { host, pty } = setup()
    const onHide = vi.fn()
    render(<TerminalDockPanel host={host} groupKey="/w" cwd="/w" onHide={onHide} />)
    await waitFor(() => { expect(pty.started).toEqual([{ commandId: 'shell', cwd: '/w' }]) })
    fireEvent.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    await screen.findByText(/No terminal is open here/)
    expect(pty.started).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Start one' }))
    await waitFor(() => { expect(pty.started).toHaveLength(2) })
    fireEvent.click(screen.getByRole('button', { name: 'Hide the terminal panel' }))
    expect(onHide).toHaveBeenCalledTimes(1)
  })
})

describe('the three layouts', () => {
  it('stacked: the right pane keeps its content and the terminal panel sits under it with a divider', async () => {
    const { host, controller } = setup()
    controller.setOpen(true)
    render(<RightColumn host={host} rightbar={<div data-testid="rightbar">Files</div>} />)
    expect(screen.getByTestId('rightbar')).toBeTruthy()
    expect(await screen.findByRole('tablist', { name: 'Terminals' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Resize the terminal panel' })).toBeTruthy()
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(false)
  })

  it('bottom: the centre column carries the terminal panel and the right column carries only the right pane', async () => {
    const { host, controller } = setup()
    controller.setMode('bottom')
    controller.setOpen(true)
    render(<><CenterColumn host={host}><div data-testid="main">chat</div></CenterColumn><RightColumn host={host} rightbar={<div data-testid="rightbar">Files</div>} /></>)
    expect(screen.getByTestId('main')).toBeTruthy()
    expect(screen.getAllByRole('tablist', { name: 'Terminals' })).toHaveLength(1)
    expect(document.querySelector('.dshDockCenter [role="tablist"]')).not.toBeNull()
    expect(document.querySelector('.dshDockRight [role="tablist"][aria-label="Terminals"]')).toBeNull()
    expect(document.querySelector('.dshDockBottom')?.getAttribute('style')).toContain('height: 280px')
  })

  it('side by side: a two-icon switcher swaps the full-height right pane between files and terminals, without unmounting the right pane', async () => {
    const { host, controller } = setup()
    controller.setMode('side')
    controller.setOpen(true)
    render(<RightColumn host={host} rightbar={<div data-testid="rightbar">Files</div>} />)
    // Opening in side mode goes to the terminals.
    expect(await screen.findByRole('tablist', { name: 'Terminals' })).toBeTruthy()
    const before = screen.getByTestId('rightbar')
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(true)
    const switcher = screen.getByRole('tablist', { name: 'Right pane' })
    fireEvent.click(within(switcher).getByRole('tab', { name: 'Show files and changes' }))
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(false)
    expect(screen.queryByRole('tablist', { name: 'Terminals' })).toBeNull()
    expect(screen.getByTestId('rightbar')).toBe(before)
    fireEvent.click(within(switcher).getByRole('tab', { name: 'Show terminals' }))
    expect(await screen.findByRole('tablist', { name: 'Terminals' })).toBeTruthy()
  })

  it('closed: nothing extra is drawn', () => {
    const { host } = setup()
    render(<><CenterColumn host={host}><div>chat</div></CenterColumn><RightColumn host={host} rightbar={<div>Files</div>} /></>)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Right pane' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Terminals' })).toBeNull()
  })

  it('a divider can be moved with the keyboard and reset by double click', async () => {
    const { host, controller } = setup()
    controller.setOpen(true)
    render(<RightColumn host={host} rightbar={<div>Files</div>} />)
    const divider = screen.getByRole('separator', { name: 'Resize the terminal panel' })
    fireEvent.keyDown(divider, { key: 'ArrowUp' })
    expect(controller.getPrefs().stackedRatio).toBeCloseTo(0.45)
    fireEvent.keyDown(divider, { key: 'ArrowDown' })
    fireEvent.keyDown(divider, { key: 'ArrowDown' })
    expect(controller.getPrefs().stackedRatio).toBeCloseTo(0.35)
    fireEvent.doubleClick(divider)
    expect(controller.getPrefs().stackedRatio).toBe(0.4)
    await act(async () => {})
  })
})

describe('the two buttons', () => {
  const rightPane = (open: boolean): RightPaneHandle & { toggles: number } => {
    const handle = { toggles: 0, toggle() { handle.toggles += 1; open = !open }, isOpen: () => open }
    return handle
  }

  it('the mode button names the next mode and moves the panel through the modes', () => {
    const { controller } = setup()
    render(<DockButtons controller={controller} rightPane={rightPane(true)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to bottom terminal' }))
    expect(controller.getPrefs().mode).toBe('bottom')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to side by side terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to stacked terminal' }))
    expect(controller.getPrefs().mode).toBe('stacked')
  })

  it('showing the panel where it lives in the right pane also opens the right pane; the bottom panel does not', () => {
    const { controller } = setup()
    const closedPane = rightPane(false)
    toggleDock(controller, closedPane)
    expect(controller.getPrefs().open).toBe(true)
    expect(closedPane.toggles).toBe(1)
    toggleDock(controller, closedPane)
    expect(controller.getPrefs().open).toBe(false)
    expect(closedPane.toggles).toBe(1)
    controller.setMode('bottom')
    toggleDock(controller, closedPane)
    expect(controller.getPrefs().open).toBe(true)
    expect(closedPane.toggles).toBe(1)
  })

  it('the toggle button reflects and flips the open state', () => {
    const { controller } = setup()
    render(<DockButtons controller={controller} rightPane={rightPane(true)} />)
    const toggle = screen.getByRole('button', { name: 'Show the terminal panel' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide the terminal panel' }).getAttribute('aria-pressed')).toBe('true')
  })
})
