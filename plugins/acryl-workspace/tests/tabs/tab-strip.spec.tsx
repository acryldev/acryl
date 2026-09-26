// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { TabStrip } from '../../src/client/tabs/TabStrip.tsx'
import { HIDDEN_AGENTS_KEY } from '../../src/client/tabs/agent-visibility.ts'

// jsdom has no ResizeObserver; the strip only uses it to keep the edge fades honest.
class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver

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

function Harness({ workspace, storage, onOpenPty }: { workspace: WorkspaceState; storage: Storage; onOpenPty: (id: string, title: string) => void }) {
  const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
  return <TabStrip snapshot={snapshot} workspace={workspace} branchLabel="main" branchTitle="/p" runningText={null} storage={storage} onClose={() => {}} onOpenPty={onOpenPty} />
}

function setup(storage = memoryStorage()) {
  const workspace = new WorkspaceState()
  const onOpenPty = vi.fn()
  render(<Harness workspace={workspace} storage={storage} onOpenPty={onOpenPty} />)
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
})
