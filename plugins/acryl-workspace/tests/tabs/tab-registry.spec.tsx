// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSavedWorkspace, serializeWorkspace } from '../../src/client/canvas/persistence.ts'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { makeDock } from '../dock/dock-fixtures.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'
import { CustomTabPane } from '../../src/client/tabs/registry/CustomTabPane.tsx'
import { TabTypeError, WorkspaceTabRegistry, type WorkspaceTabProps, type WorkspaceTabType } from '../../src/client/tabs/registry/tab-registry.ts'
import { TabStrip } from '../../src/client/tabs/TabStrip.tsx'
import { TabTypesState } from '../../src/client/tabs/tab-types-state.ts'
import { TabsPanel } from '../../src/client/tabs/TabsPanel.tsx'
import { TerminalRegistry } from '../../src/client/terminal/terminal-session.ts'

class NoopObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver
afterEach(cleanup)

function Notes({ state, setState, setTitle }: WorkspaceTabProps) {
  return (
    <div>
      <textarea aria-label="Notes" value={state ?? ''} onChange={(event) => { setState(event.target.value) }} />
      <button type="button" onClick={() => { setTitle('Renamed') }}>Rename</button>
    </div>
  )
}

const notes: WorkspaceTabType = { kind: 'acme.notes', label: 'Notes', description: 'Quick notes', glyph: 'N', component: Notes }

describe('WorkspaceTabRegistry', () => {
  it('registers, lists in order, looks up, notifies and unregisters exactly its own registration', () => {
    const registry = new WorkspaceTabRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const first = registry.getSnapshot()
    const dispose = registry.register(notes)
    expect(registry.getSnapshot()).not.toBe(first)
    expect(registry.get('acme.notes')?.label).toBe('Notes')
    dispose()
    dispose()
    expect(registry.get('acme.notes')).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)
    registry.register(notes)
    expect(registry.getSnapshot()).toHaveLength(1)
  })

  it('refuses a duplicate kind and a definition that breaks a rule, naming the rule', () => {
    const registry = new WorkspaceTabRegistry()
    registry.register(notes)
    expect(() => registry.register(notes)).toThrow(TabTypeError)
    for (const bad of [{ kind: 'notes' }, { kind: 'Acme.Notes' }, { label: '  ' }, { glyph: '' }, { glyph: 'abc' }, { description: 'x'.repeat(201) }]) {
      expect(() => registry.register({ ...notes, kind: 'acme.other', ...bad })).toThrow(TabTypeError)
    }
  })
})

describe('CustomTabPane', () => {
  it('renders the plugin component, saves its state on the tab and lets it rename the tab', () => {
    const registry = new WorkspaceTabRegistry()
    registry.register(notes)
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('custom', { customType: 'acme.notes', title: 'Notes' })
    if (tile === undefined) throw new Error('no tile')
    function Harness() {
      const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
      const now = snapshot.tiles.find(candidate => candidate.id === tile?.id)
      return now === undefined ? null : <CustomTabPane tile={now} workspace={workspace} registry={registry} />
    }
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } })
    expect(workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.customState).toBe('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(workspace.getSnapshot().tiles.find(t => t.id === tile.id)?.title).toBe('Renamed')
  })

  it('shows a placeholder while the plugin is off, keeps the tab state, and restores it when the plugin returns', () => {
    const registry = new WorkspaceTabRegistry()
    const workspace = new WorkspaceState()
    const tile = workspace.addTile('custom', { customType: 'acme.notes', title: 'Notes' })
    if (tile === undefined) throw new Error('no tile')
    workspace.updateTile(tile.id, { customState: 'kept text' })
    function Harness() {
      const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
      const now = snapshot.tiles.find(candidate => candidate.id === tile?.id)
      return now === undefined ? null : <CustomTabPane tile={now} workspace={workspace} registry={registry} />
    }
    render(<Harness />)
    expect(screen.getByRole('status').textContent).toContain('acme.notes')
    expect(screen.queryByLabelText('Notes')).toBeNull()
    act(() => { registry.register(notes) })
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('kept text')
  })
})

describe('saving plugin tabs', () => {
  it('round-trips a plugin tab with its type and state, even when the plugin is not registered', () => {
    const groups = new WorkspaceGroups()
    const shell = new WorkspaceShellState({ repo: async () => { throw new Error('none') }, status: async () => { throw new Error('none') } } as never)
    const state = groups.stateFor('')
    const tile = state.addTile('custom', { customType: 'acme.notes', title: 'Notes' })
    if (tile === undefined) throw new Error('no tile')
    state.updateTile(tile.id, { customState: '{"a":1}' })
    const saved = parseSavedWorkspace(serializeWorkspace(shell.getSnapshot().mode, groups))
    expect(saved?.groups[''] ?? saved?.groups[Object.keys(saved.groups)[0] ?? '']).toBeDefined()
    const restored = Object.values(saved?.groups ?? {}).flatMap(group => group.tiles)
    expect(restored).toEqual([{ kind: 'custom', title: 'Notes', customType: 'acme.notes', customState: '{"a":1}' }])
  })

  it('drops a saved plugin tab that has no valid type', () => {
    const raw = JSON.stringify({ version: 1, mode: 'chats', groups: { '': { tiles: [{ kind: 'custom', title: 'x' }, { kind: 'custom', title: 'y', customType: 'Bad Kind' }], active: -1, split: -1 } } })
    expect(Object.values(parseSavedWorkspace(raw)?.groups ?? {}).flatMap(group => group.tiles)).toEqual([])
  })
})

describe('plugin tab types in the + menu and Settings', () => {
  it('lists a registered type in the menu, opens it, and follows Settings turning it off and the plugin unloading', () => {
    const registry = new WorkspaceTabRegistry()
    const tabTypes = new TabTypesState(undefined)
    const workspace = new WorkspaceState()
    const dock = makeDock().controller
    const terminals = new TerminalRegistry({ createSocket: () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null, readyState: 0 }), urlFor: id => `ws://x/${id}` })
    function Harness() {
      const snapshot = useSyncExternalStore(l => workspace.subscribe(l), () => workspace.getSnapshot())
      return (
        <>
          <TabStrip snapshot={snapshot} workspace={workspace} branchLabel="main" branchTitle="/p" runningText={null} storage={undefined} customAgents={[]} terminals={terminals} onClose={() => {}} onOpenPty={() => {}} agentSettings={null} tabTypes={tabTypes} tabRegistry={registry} dock={dock} onSetAgentEnabled={async () => {}} onManageSettings={() => true} />
          <TabsPanel tabTypes={tabTypes} tabRegistry={registry} />
        </>
      )
    }
    render(<Harness />)
    let dispose = () => {}
    act(() => { dispose = registry.register(notes) })
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Notes/ }))
    const opened = workspace.getSnapshot().tiles.at(-1)
    expect(opened).toMatchObject({ kind: 'custom', customType: 'acme.notes', title: 'Notes' })
    expect(document.querySelector('[role="tab"] .dshWorkspaceTabGlyph')).not.toBeNull()

    const row = document.querySelector('[data-tab-type="acme.notes"]') as HTMLElement
    fireEvent.click(within(row).getByRole('radio', { name: 'Disabled' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose what to open' }))
    expect(screen.queryByRole('menuitem', { name: /Notes/ })).toBeNull()
    act(() => { dispose() })
    expect(document.querySelector('[data-tab-type="acme.notes"]')).toBeNull()
  })
})
