// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { DOCK_STORAGE_KEY } from '../../src/client/dock/dock-controller.ts'
import { BOTTOM_MAX, BOTTOM_MIN, DEFAULT_DOCK_PREFS, nextMode, parseDockPrefs, switchLabel } from '../../src/client/dock/dock-model.ts'
import { DockGroups, DockTabsState, MAX_DOCK_TABS, parseSavedDockGroups, serializeDockGroups } from '../../src/client/dock/dock-tabs.ts'
import { makeDock, memoryStorage } from './dock-fixtures.ts'

describe('dock layout rules', () => {
  it('cycles stacked, bottom, side and names the next mode on the button', () => {
    expect(nextMode('stacked')).toBe('bottom')
    expect(nextMode('bottom')).toBe('side')
    expect(nextMode('side')).toBe('stacked')
    expect(switchLabel('stacked')).toBe('Switch to bottom terminal')
    expect(switchLabel('bottom')).toBe('Switch to side by side terminal')
    expect(switchLabel('side')).toBe('Switch to stacked terminal')
  })

  it('reads saved preferences field by field, clamping sizes and dropping nonsense', () => {
    expect(parseDockPrefs(null)).toEqual(DEFAULT_DOCK_PREFS)
    expect(parseDockPrefs([1])).toEqual(DEFAULT_DOCK_PREFS)
    expect(parseDockPrefs({ mode: 'side', sideView: 'terminals', stackedRatio: 5, bottomHeight: 9999 })).toEqual({ mode: 'side', sideView: 'terminals', stackedRatio: 0.85, bottomHeight: BOTTOM_MAX })
    expect(parseDockPrefs({ mode: 'weird', stackedRatio: 'x', bottomHeight: 1 })).toEqual({ ...DEFAULT_DOCK_PREFS, bottomHeight: BOTTOM_MIN })
  })
})

describe('DockTabsState', () => {
  const ids = () => { let n = 0; return () => `id${String(++n)}` }

  it('adds tabs with counting titles, selects the new one, and stops at the limit', () => {
    const state = new DockTabsState(ids())
    const first = state.add()
    const second = state.add()
    expect([first?.title, second?.title]).toEqual(['Terminal', 'Terminal 2'])
    expect(state.getSnapshot().activeId).toBe(second?.id)
    for (let i = 2; i < MAX_DOCK_TABS; i += 1) state.add()
    expect(state.add()).toBeUndefined()
  })

  it('closes a tab, moving to its left neighbour, and reports what was removed', () => {
    const state = new DockTabsState(ids())
    const [a, b, c] = [state.add(), state.add(), state.add()]
    state.update(b?.id ?? '', { terminalId: 'T2' })
    state.select(b?.id ?? '')
    expect(state.close(b?.id ?? '')?.terminalId).toBe('T2')
    expect(state.getSnapshot().activeId).toBe(a?.id)
    expect(state.close('nope')).toBeUndefined()
    state.close(a?.id ?? '')
    expect(state.getSnapshot().activeId).toBe(c?.id)
  })

  it('renames, and an empty name goes back to a default title', () => {
    const state = new DockTabsState(ids())
    const tab = state.add()
    state.rename(tab?.id ?? '', '  api   work ')
    expect(state.getSnapshot().tabs[0]?.title).toBe('api work')
    state.rename(tab?.id ?? '', '   ')
    expect(state.getSnapshot().tabs[0]?.title).toBe('Terminal')
  })

  // Deliberate no-op: a shell's own title (commonly `user@host: cwd`) is too long for a narrow tab strip, so a
  // dock tab keeps its short default name instead of following it.
  it('never follows the shell title; the tab keeps its short default name', () => {
    const state = new DockTabsState(ids())
    const tab = state.add()
    state.update(tab?.id ?? '', { terminalId: 'T1' })
    expect(state.applyTerminalTitle('T1', 'proj: vim')).toBe(false)
    expect(state.getSnapshot().tabs[0]?.title).toBe('Terminal')
    state.rename(tab?.id ?? '', 'mine')
    expect(state.applyTerminalTitle('T1', 'other')).toBe(false)
    expect(state.getSnapshot().tabs[0]?.title).toBe('mine')
    expect(state.applyTerminalTitle('nope', 'x')).toBe(false)
  })
})

describe('saving dock tabs', () => {
  it('round-trips only tabs that have a terminal, with the active one, and drops bad entries on reading', () => {
    const groups = new DockGroups({}, (() => { let n = 0; return () => `g${String(++n)}` })())
    const state = groups.stateFor('/w')
    const a = state.add(); const b = state.add(); state.add()
    state.update(a?.id ?? '', { terminalId: 'T1' })
    state.update(b?.id ?? '', { terminalId: 'T2' })
    state.select(b?.id ?? '')
    const saved = serializeDockGroups(groups)
    expect(saved).toEqual({ '/w': { tabs: [{ title: 'Terminal', terminalId: 'T1' }, { title: 'Terminal 2', terminalId: 'T2' }], active: 1 } })
    const restored = new DockGroups(parseSavedDockGroups(JSON.parse(JSON.stringify(saved))))
    expect(restored.stateFor('/w').getSnapshot().tabs.map(t => t.terminalId)).toEqual(['T1', 'T2'])
    expect(parseSavedDockGroups({ x: { tabs: [{ title: 1, terminalId: 'T' }, { title: 'ok', terminalId: '' }], active: 0 }, y: 5, z: { tabs: [{ title: 'ok', terminalId: 'T' }] } })).toEqual({ z: { tabs: [{ title: 'ok', terminalId: 'T' }], active: 0 } })
  })
})

describe('DockController', () => {
  it('cycles modes, remembers the side view across a cycle, and clamps sizes', () => {
    const { controller } = makeDock()
    const listener = vi.fn()
    controller.subscribe(listener)
    expect(controller.getPrefs()).toMatchObject({ mode: 'stacked', sideView: 'files' })
    controller.cycleMode()
    controller.cycleMode()
    expect(controller.getPrefs()).toMatchObject({ mode: 'side', sideView: 'files' })
    controller.setSideView('terminals')
    expect(controller.getPrefs()).toMatchObject({ sideView: 'terminals' })
    controller.setBottomHeight(50)
    controller.setStackedRatio(0.99)
    expect(controller.getPrefs()).toMatchObject({ bottomHeight: BOTTOM_MIN, stackedRatio: 0.85 })
    expect(listener).toHaveBeenCalled()
  })

  it('starts a terminal in the worktree as a new tab, shows a refusal on the tab, and ends the terminal when the tab closes', async () => {
    const { controller, pty, terminals } = makeDock()
    await controller.openTab('/w', '/w', { cols: 80, rows: 24 })
    expect(pty.started).toEqual([{ commandId: 'shell', cwd: '/w' }])
    const state = controller.groups.stateFor('/w')
    expect(state.getSnapshot().tabs[0]).toMatchObject({ title: 'Terminal', terminalId: 'term-1' })
    const release = vi.spyOn(terminals, 'release')
    await controller.closeTab('/w', state.getSnapshot().tabs[0]?.id ?? '')
    expect(pty.closed).toEqual(['term-1'])
    expect(release).toHaveBeenCalledWith('term-1')
    vi.mocked(pty.api.start).mockRejectedValueOnce(new Error('no shell here'))
    await controller.openTab('/w', '/w')
    expect(state.getSnapshot().tabs[0]?.error).toBe('no shell here')
  })

  it('remembers the layout and the tabs, and restores them in a new controller', async () => {
    const storage = memoryStorage()
    const first = makeDock(storage)
    first.controller.setMode('bottom')
    await first.controller.openTab('/w', '/w')
    first.controller.flush()
    expect(JSON.parse(storage.data.get(DOCK_STORAGE_KEY) ?? '{}').prefs).toMatchObject({ mode: 'bottom' })
    const second = makeDock(storage)
    expect(second.controller.getPrefs()).toMatchObject({ mode: 'bottom' })
    expect(second.controller.groups.stateFor('/w').getSnapshot().tabs[0]?.terminalId).toBe('term-1')
  })

  it('starts fresh from damaged storage', () => {
    const { controller } = makeDock(memoryStorage({ [DOCK_STORAGE_KEY]: '{not json' }))
    expect(controller.getPrefs()).toEqual(DEFAULT_DOCK_PREFS)
  })

  it('while connected: keeps every terminal alive, ignores the shell title (no-op), saves on disconnect', async () => {
    const { controller, terminals, storage } = makeDock()
    const ensure = vi.spyOn(terminals, 'ensure')
    await controller.openTab('/w', '/w')
    const stop = controller.connect()
    expect(ensure).toHaveBeenCalledWith('term-1')
    // The registry's own listeners are how a lost terminal and a title reach the controller.
    const session = terminals.ensure('term-1')
    expect(session).toBeDefined()
    controller.groups.stateFor('/w').applyTerminalTitle('term-1', 'proj: vim')
    expect(controller.groups.stateFor('/w').getSnapshot().tabs[0]?.title).toBe('Terminal')
    stop()
    expect(JSON.parse(storage.data.get(DOCK_STORAGE_KEY) ?? '{}').groups['/w'].tabs[0].title).toBe('Terminal')
  })
})
