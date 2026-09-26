// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomAgent } from '../../src/agents/definition.ts'
import { WorkspaceState, type WorkspaceTile } from '../../src/client/canvas/state.ts'
import { TabStrip } from '../../src/client/tabs/TabStrip.tsx'
import { TerminalRegistry } from '../../src/client/terminal/terminal-session.ts'
import { HIDDEN_AGENTS_KEY } from '../../src/client/tabs/agent-visibility.ts'

// jsdom has no ResizeObserver; the strip only uses it to keep the edge fades honest.
class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver
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

function Harness({ workspace, storage, onOpenPty, onClose = () => {}, custom = [], onAdd = async () => {}, onRemove = async () => {} }: { workspace: WorkspaceState; storage: Storage; onOpenPty: (id: string, title: string) => void; onClose?: (tile: WorkspaceTile) => void; custom?: readonly CustomAgent[]; onAdd?: (agent: CustomAgent) => Promise<void>; onRemove?: (id: string) => Promise<void> }) {
  const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
  return <TabStrip snapshot={snapshot} workspace={workspace} branchLabel="main" branchTitle="/p" runningText={null} storage={storage} customAgents={custom} terminals={terminals} onClose={onClose} onOpenPty={onOpenPty} onAddAgent={onAdd} onRemoveAgent={onRemove} />
}

function setup(storage = memoryStorage(), extra: { onClose?: (tile: WorkspaceTile) => void; custom?: readonly CustomAgent[]; onAdd?: (agent: CustomAgent) => Promise<void>; onRemove?: (id: string) => Promise<void> } = {}) {
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
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    expect(document.querySelectorAll('[role="menu"] [data-agent]').length).toBeGreaterThan(5)
    fireEvent.click(screen.getByRole('menuitem', { name: /Codex/ }))
    expect(onOpenPty).toHaveBeenCalledWith('codex', 'Codex')
  })

  it('lets the user hide agents from the + menu and remembers it', () => {
    const { storage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure agents...' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Aider/ }))
    expect(JSON.parse(storage.getItem(HIDDEN_AGENTS_KEY) ?? '[]')).toEqual(['aider'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }))
    expect(screen.queryByRole('menuitem', { name: /Aider/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Codex/ })).toBeTruthy()
  })

  it('starts with the agents already hidden in a previous visit', () => {
    setup(memoryStorage({ [HIDDEN_AGENTS_KEY]: JSON.stringify(['goose']) }))
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    expect(screen.queryByRole('menuitem', { name: /Goose/ })).toBeNull()
  })

  const mine: CustomAgent = { id: 'my-agent', label: 'My Agent', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } }

  it('lists custom agents in the + menu with their own badge and starts them by id', () => {
    const { onOpenPty } = setup(memoryStorage(), { custom: [mine] })
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    expect(document.querySelector('[role="menu"] [data-agent="my-agent"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /My Agent/ }))
    expect(onOpenPty).toHaveBeenCalledWith('my-agent', 'My Agent')
  })

  it('adds an agent from the form, showing the exact command first and refusing unsafe input', async () => {
    const onAdd = vi.fn(async () => {})
    setup(memoryStorage(), { onAdd })
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure agents...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add an agent...' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Agent' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'my-agent && rm -rf ~' } })
    expect((screen.getByRole('button', { name: 'Add agent' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/without spaces or shell characters/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'my-agent' } })
    fireEvent.change(screen.getByLabelText('Arguments (one per line)'), { target: { value: '--model\nfast model' } })
    expect(screen.getByText('my-agent --model "fast model"')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }))
    await waitFor(() => { expect(onAdd).toHaveBeenCalledTimes(1) })
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'my-agent', command: 'my-agent', args: ['--model', 'fast model'] }))
  })

  it("shows the Host's own refusal and keeps the form open", async () => {
    setup(memoryStorage(), { onAdd: () => Promise.reject(new Error('"my-agent" was not found on this machine')) })
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure agents...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add an agent...' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Agent' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'my-agent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }))
    expect((await screen.findByRole('alert')).textContent).toContain('was not found on this machine')
    expect(screen.getByLabelText('Command')).toBeTruthy()
  })

  it('removes a custom agent from Configure agents', async () => {
    const onRemove = vi.fn(async () => {})
    setup(memoryStorage(), { custom: [mine], onRemove })
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure agents...' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove My Agent' }))
    await waitFor(() => { expect(onRemove).toHaveBeenCalledWith('my-agent') })
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

  it('lets the user hide tab types (never the terminal) from the + menu', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
    expect(screen.getByRole('menuitem', { name: 'New Board' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure agents...' }))
    expect(screen.queryByRole('menuitemcheckbox', { name: /Terminal/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Board tabs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }))
    expect(screen.queryByRole('menuitem', { name: 'New Board' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'New Terminal' })).toBeTruthy()
  })
})
