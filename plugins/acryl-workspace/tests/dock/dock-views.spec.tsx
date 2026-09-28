// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DockButtons } from '../../src/client/dock/DockButtons.tsx'
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
    render(<TerminalDockPanel host={host} groupKey="" cwd={undefined} />)
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

  it('does not start another terminal after the last one is closed, and offers to start one', async () => {
    const { host, pty } = setup()
    render(<TerminalDockPanel host={host} groupKey="/w" cwd="/w" />)
    await waitFor(() => { expect(pty.started).toEqual([{ commandId: 'shell', cwd: '/w' }]) })
    fireEvent.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    await screen.findByText(/No terminal is open here/)
    expect(pty.started).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Start one' }))
    await waitFor(() => { expect(pty.started).toHaveLength(2) })
  })
})

describe('the three layouts (the panel is always visible; only its position changes)', () => {
  it('stacked: the right pane keeps its content and the terminal panel sits under it with a divider', async () => {
    const { host } = setup()
    render(<RightColumn host={host} rightbar={<div data-testid="rightbar">Files</div>} />)
    expect(screen.getByTestId('rightbar')).toBeTruthy()
    expect(await screen.findByRole('tablist', { name: 'Terminals' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Resize the terminal panel' })).toBeTruthy()
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(false)
  })

  it('bottom: the centre column carries the terminal panel and the right column carries only the right pane', async () => {
    const { host, controller } = setup()
    controller.setMode('bottom')
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
    render(<RightColumn host={host} rightbar={<div data-testid="rightbar">Files</div>} />)
    const switcher = await screen.findByRole('tablist', { name: 'Right pane' })
    const before = screen.getByTestId('rightbar')
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(false)
    fireEvent.click(within(switcher).getByRole('tab', { name: 'Show terminals' }))
    expect(await screen.findByRole('tablist', { name: 'Terminals' })).toBeTruthy()
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(true)
    fireEvent.click(within(switcher).getByRole('tab', { name: 'Show files and changes' }))
    expect(document.querySelector('.dshDockRightTop')?.hasAttribute('hidden')).toBe(false)
    expect(screen.queryByRole('tablist', { name: 'Terminals' })).toBeNull()
    expect(screen.getByTestId('rightbar')).toBe(before)
  })

  it('a divider can be moved with the keyboard and reset by double click', async () => {
    const { host, controller } = setup()
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

describe('the mode button', () => {
  it('names the next mode and moves the panel through the modes; it is the only control (owner decision 2026-09-28: no separate show/hide)', () => {
    const { controller } = setup()
    render(<DockButtons controller={controller} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to bottom terminal' }))
    expect(controller.getPrefs().mode).toBe('bottom')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to side by side terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to stacked terminal' }))
    expect(controller.getPrefs().mode).toBe('stacked')
  })
})
