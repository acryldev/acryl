// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomAgent } from '../../src/agents/definition.ts'
import { WorkspaceState, type WorkspaceTile } from '../../src/client/canvas/state.ts'
import { TabStrip } from '../../src/client/tabs/TabStrip.tsx'
import { TerminalRegistry } from '../../src/client/terminal/terminal-session.ts'
import type { AgentSettingsView } from '../../src/agents/contract.ts'
import { entry, view } from '../agents/fixtures.ts'
import { makeDock, makeStatus } from '../dock/dock-fixtures.ts'
import { WorkspaceTabRegistry } from '../../src/client/tabs/registry/tab-registry.ts'
import { TabTypesState } from '../../src/client/tabs/tab-types-state.ts'

// jsdom has no ResizeObserver; the strip only uses it to keep the edge fades honest.
class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver
const tabRegistry = new WorkspaceTabRegistry()
const dock = makeDock().controller
const agentStatus = makeStatus().state
const terminals = new TerminalRegistry({ createSocket: () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null, readyState: 0 }), urlFor: id => `ws://x/${id}` })

afterEach(cleanup)

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => { data.clear() },
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
}

function Harness({ workspace, storage, onOpenPty, onClose = () => {}, custom = [], settings = null, onManage = () => true, tabTypes, onSetEnabled = async () => {} }: { workspace: WorkspaceState; storage: Storage; onOpenPty: (id: string, title: string) => void; onClose?: (tile: WorkspaceTile) => void; custom?: readonly CustomAgent[]; settings?: AgentSettingsView | null; onManage?: (section: 'agents' | 'tabs') => boolean; tabTypes?: TabTypesState; onSetEnabled?: (id: string, enabled: boolean) => Promise<void> }) {
  const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
  return <TabStrip snapshot={snapshot} workspace={workspace} branchLabel="main" branchTitle="/p" runningText={null} storage={storage} customAgents={custom} terminals={terminals} onClose={onClose} onOpenPty={onOpenPty} agentSettings={settings} tabTypes={tabTypes ?? new TabTypesState(storage)} tabRegistry={tabRegistry} dock={dock} agentStatus={agentStatus} onSetAgentEnabled={onSetEnabled} onManageSettings={onManage} />
}

function setup(storage = memoryStorage(), extra: { onClose?: (tile: WorkspaceTile) => void; custom?: readonly CustomAgent[]; settings?: AgentSettingsView | null; onManage?: (section: 'agents' | 'tabs') => boolean; tabTypes?: TabTypesState; onSetEnabled?: (id: string, enabled: boolean) => Promise<void> } = {}) {
  const workspace = new WorkspaceState()
  const onOpenPty = vi.fn()
  render(<Harness workspace={workspace} storage={storage} onOpenPty={onOpenPty} {...extra} />)
  return { workspace, storage, onOpenPty }
}

describe('TabStrip', () => {
  it('renames a tab in place: Enter keeps the name, Escape cancels, empty restores the default', () => {
    const { workspace } = setup()
    act(() => { workspace.addTile('pty', { commandId: 'claude', title: 'Claude' }) })
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Claude/ }))
    fireEvent.change(screen.getByLabelText('Rename Claude'), { target: { value: '  api   work ' } })
    fireEvent.submit(screen.getByLabelText('Rename Claude').closest('form') as HTMLFormElement)
    expect(workspace.getSnapshot().tiles.at(-1)?.title).toBe('api work')

    fireEvent.doubleClick(screen.getByRole('tab', { name: /api work/ }))
    fireEvent.change(screen.getByLabelText('Rename api work'), { target: { value: 'nope' } })
    fireEvent.keyDown(screen.getByLabelText('Rename api work'), { key: 'Escape' })
    expect(workspace.getSnapshot().tiles.at(-1)?.title).toBe('api work')

    fireEvent.doubleClick(screen.getByRole('tab', { name: /api work/ }))
    fireEvent.change(screen.getByLabelText('Rename api work'), { target: { value: '   ' } })
    fireEvent.blur(screen.getByLabelText('Rename api work'))
    expect(workspace.getSnapshot().tiles.at(-1)?.title).toBe('Claude')
  })

  it('shows an icon badge on agent tabs', () => {
    const { workspace } = setup()
    act(() => { workspace.addTile('pty', { commandId: 'codex', title: 'Codex' }) })
    expect(document.querySelector('[data-agent="codex"]')).not.toBeNull()
  })

  it('lists the agents with icons in the + menu and starts one', () => {
    const { onOpenPty } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    expect(document.querySelectorAll('[role="menu"] [data-agent]').length).toBeGreaterThan(5)
    fireEvent.click(screen.getByRole('menuitem', { name: /Codex/ }))
    expect(onOpenPty).toHaveBeenCalledWith('codex', 'Codex')
  })

  it('lists only installed and enabled agents once Settings has answered, and tags the default', () => {
    setup(memoryStorage(), { settings: view([entry('claude'), entry('codex', { enabled: false }), entry('aider', { installed: false })], { defaultAgent: 'claude' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    expect(screen.getByRole('menuitem', { name: /Claude/ }).textContent).toContain('default')
    expect(screen.queryByRole('menuitem', { name: /Codex/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Aider/ })).toBeNull()
  })

  it('turns the agent list into checkboxes with Manage agents, showing disabled agents too, and toggles right there', async () => {
    const onSetEnabled = vi.fn(async (_id: string, _enabled: boolean) => {})
    setup(memoryStorage(), { settings: view([entry('claude'), entry('codex', { enabled: false }), entry('aider', { installed: false })]), onSetEnabled })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage agents...' }))
    const claude = screen.getByRole('menuitemcheckbox', { name: /Claude/ })
    expect(claude.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemcheckbox', { name: /Codex/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('menuitemcheckbox', { name: /Aider/ })).toBeNull()
    fireEvent.click(claude)
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Codex/ }))
    expect(onSetEnabled).toHaveBeenNthCalledWith(1, 'claude', false)
    expect(onSetEnabled).toHaveBeenNthCalledWith(2, 'codex', true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }))
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull()
  })

  it('opens Settings > Agents from Add more agents, and says where to go when it cannot', () => {
    const onManage = vi.fn((_section: 'agents' | 'tabs') => false)
    setup(memoryStorage(), { onManage })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add more agents...' }))
    expect(onManage).toHaveBeenCalledWith('agents')
    expect(screen.getByRole('status').textContent).toContain('Settings')
    onManage.mockReturnValue(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add more agents...' }))
    expect(screen.queryByRole('menuitem', { name: 'Add more agents...' })).toBeNull()
  })

  it('opens the default agent from Settings when + is clicked, and a blank terminal for No agent', () => {
    const { onOpenPty } = setup(memoryStorage(), { settings: view([entry('claude')], { defaultAgent: 'claude' }) })
    fireEvent.click(screen.getByRole('button', { name: 'New tab: Claude' }))
    expect(onOpenPty).toHaveBeenCalledWith('claude', 'Claude')
    cleanup()
    const none = setup(memoryStorage(), { settings: view([entry('claude')], { defaultAgent: 'none' }) })
    fireEvent.click(screen.getByRole('button', { name: 'New tab: Terminal' }))
    expect(none.onOpenPty).toHaveBeenCalledWith('shell', 'Terminal')
  })

  const mine: CustomAgent = { id: 'my-agent', label: 'My Agent', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } }

  it('lists custom agents in the + menu with their own badge and starts them by id', () => {
    const { onOpenPty } = setup(memoryStorage(), { custom: [mine] })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    expect(document.querySelector('[role="menu"] [data-agent="my-agent"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /My Agent/ }))
    expect(onOpenPty).toHaveBeenCalledWith('my-agent', 'My Agent')
  })

  it('offers tab actions on right-click: rename, close others, close to the right', () => {
    const onClose = vi.fn()
    const { workspace } = setup(memoryStorage(), { onClose })
    act(() => { workspace.addTile('doc'); workspace.addTile('kanban'); workspace.addTile('diff') })
    const tabs = screen.getAllByRole('tab')
    // The workspace starts with its chat tab: chat, doc, board, diff.
    expect(tabs.length).toBe(4)
    fireEvent.contextMenu(tabs[1] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close to the right' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    onClose.mockClear()
    fireEvent.contextMenu(screen.getAllByRole('tab')[1] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close others' }))
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.contextMenu(screen.getAllByRole('tab')[0] as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(screen.getByLabelText(/^Rename /)).toBeTruthy()
  })

  it('lists only the tab types that are turned on, never dropping the terminal, and follows a change at once', () => {
    const storage = memoryStorage()
    const tabTypes = new TabTypesState(storage)
    setup(storage, { tabTypes })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    expect(screen.getByRole('menuitem', { name: 'New Board' })).toBeTruthy()
    act(() => { tabTypes.setEnabled('kanban', false); tabTypes.setEnabled('pty', false) })
    expect(screen.queryByRole('menuitem', { name: 'New Board' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'New Terminal' })).toBeTruthy()
    expect(new TabTypesState(storage).isEnabled('kanban')).toBe(false)
  })

  it('links "Add your own tab type" to Settings > Tabs', () => {
    const onManage = vi.fn(() => true)
    setup(memoryStorage(), { onManage })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add your own tab type...' }))
    expect(onManage).toHaveBeenCalledWith('tabs')
  })

  it('opens the last thing you opened when + is clicked, starting with a terminal', () => {
    const { workspace, onOpenPty, storage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New tab: Terminal' }))
    expect(onOpenPty).toHaveBeenCalledWith('shell', 'Terminal')
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Codex/ }))
    expect(onOpenPty).toHaveBeenLastCalledWith('codex', 'Codex')
    expect(storage.getItem('acryl-workspace:last-tab')).toContain('codex')
    fireEvent.click(screen.getByRole('button', { name: 'New tab: Codex' }))
    expect(onOpenPty).toHaveBeenLastCalledWith('codex', 'Codex')
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Board' }))
    fireEvent.click(screen.getByRole('button', { name: 'New tab: Board' }))
    expect(workspace.getSnapshot().tiles.filter(tile => tile.kind === 'kanban')).toHaveLength(2)
  })
})
