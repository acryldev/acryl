// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseStatuses } from '../../src/client/status/agent-status-api.ts'
import { attentionByWorktree } from '../../src/client/status/attention-model.ts'
import { AgentStatusState } from '../../src/client/status/agent-status-state.ts'
import { buildProjectRows } from '../../src/client/projects/sidebar-model.ts'
import { TabActivity } from '../../src/client/tabs/TabActivity.tsx'
import { AgentsPanel } from '../../src/client/agents/AgentsSection.tsx'
import { AgentsState } from '../../src/client/agents/agents-state.ts'
import type { AgentSettingsView } from '../../src/agents/contract.ts'
import { entry, view } from '../agents/fixtures.ts'
import { makeStatus } from '../dock/dock-fixtures.ts'

afterEach(cleanup)

describe('agent status reading', () => {
  it('keeps well-formed entries and drops the rest', () => {
    expect(parseStatuses({ statuses: [{ terminalId: 'a', state: 'waiting', at: 1 }, { terminalId: 'b', state: 'nope', at: 1 }, 7, { terminalId: 'c', state: 'done' }] })).toEqual([{ terminalId: 'a', state: 'waiting', at: 1 }])
    expect(() => parseStatuses({})).toThrow()
  })
})

describe('AgentStatusState', () => {
  it('shows what the Host reports, and only says "needs you" when an agent newly starts waiting', async () => {
    const { state, set } = makeStatus()
    const needs = vi.fn()
    state.onNeedsYou(needs)
    set([{ terminalId: 'a', state: 'waiting', at: 1 }])
    await state.refresh()
    // Already waiting when the page opened: not news.
    expect(state.getSnapshot().get('a')).toBe('waiting')
    expect(needs).not.toHaveBeenCalled()
    set([{ terminalId: 'a', state: 'working', at: 2 }])
    await state.refresh()
    set([{ terminalId: 'a', state: 'waiting', at: 3 }, { terminalId: 'b', state: 'waiting', at: 3 }])
    await state.refresh()
    expect(needs.mock.calls.map(call => call[0])).toEqual(['a', 'b'])
    await state.refresh()
    expect(needs).toHaveBeenCalledTimes(2)
  })

  it('keeps the last answer when the Host fails, and polls only while the page is visible', async () => {
    let fail = false
    const api = { list: vi.fn(async () => { if (fail) throw new Error('down'); return [{ terminalId: 'a', state: 'done' as const, at: 1 }] }) }
    const state = new AgentStatusState(api)
    await state.refresh()
    fail = true
    await state.refresh()
    expect(state.getSnapshot().get('a')).toBe('done')
    fail = false
    vi.useFakeTimers()
    let visible = false
    const stop = state.start(1000, () => visible)
    await vi.advanceTimersByTimeAsync(3000)
    const whileHidden = api.list.mock.calls.length
    visible = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.list.mock.calls.length).toBeGreaterThan(whileHidden)
    stop()
    const afterStop = api.list.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.list.mock.calls.length).toBe(afterStop)
    vi.useRealTimers()
  })
})

describe('what each worktree shows', () => {
  const tabs = new Map([
    ['/a', [{ kind: 'pty', commandId: 'claude', terminalId: 't1' }, { kind: 'pty', commandId: 'shell', terminalId: 't2' }, { kind: 'chat' }]],
    ['/b', [{ kind: 'pty', commandId: 'codex', terminalId: 't3' }]],
    ['/c', [{ kind: 'pty', commandId: 'claude' }]],
  ])

  it('counts only agent tabs that report waiting or working', () => {
    const states = new Map([['t1', 'waiting' as const], ['t2', 'waiting' as const], ['t3', 'done' as const]])
    expect([...attentionByWorktree(tabs, states)]).toEqual([['/a', { waiting: 1, working: 0 }]])
    expect([...attentionByWorktree(tabs, new Map([['t3', 'working' as const]]))]).toEqual([['/b', { waiting: 0, working: 1 }]])
  })

  it('makes an agent that needs you the row dot, above running and above everything but a failed status', () => {
    const snapshot = { mode: 'projects', selectedPath: '/a', repos: [{ root: '/a', name: 'a', worktrees: [{ path: '/a', branch: 'main', head: 'x', main: true, phase: 'ready', changes: [], added: 0, removed: 0, truncated: false }] }] } as never
    const rows = (attention: Parameters<typeof buildProjectRows>[3]) => buildProjectRows(snapshot, [{ cwd: '/a', running: true, blank: false }], new Map(), attention)[0]?.rows[0]?.dot
    expect(rows(new Map())).toBe('running')
    expect(rows(new Map([['/a', { waiting: 1, working: 0 }]]))).toBe('attention')
    expect(rows(new Map([['/a', { waiting: 0, working: 2 }]]))).toBe('running')
  })
})

describe('the tab marker', () => {
  const live = { status: 'live' as const, exitCode: null, error: null }
  const session = { subscribe: () => () => {}, getSnapshot: () => live } as never
  it('says needs you, or finished and waiting for your message, or plain running', () => {
    const { rerender } = render(<TabActivity session={session} state="waiting" />)
    expect(screen.getByTitle('Needs you').getAttribute('data-state')).toBe('waiting')
    rerender(<TabActivity session={session} state="done" />)
    expect(screen.getByTitle('Finished, waiting for your next message').getAttribute('data-state')).toBe('idle')
    rerender(<TabActivity session={session} state="working" />)
    expect(screen.getByTitle('Running').getAttribute('data-state')).toBe('live')
    rerender(<TabActivity session={session} />)
    expect(screen.getByTitle('Running')).toBeTruthy()
  })
})

describe('Settings > Agents status hooks switch', () => {
  it('turns the hooks off and on through the Host', async () => {
    const changes: unknown[] = []
    let current: AgentSettingsView = view([entry('claude')])
    const agents = new AgentsState({
      list: async () => [], add: async () => [], remove: async () => [],
      settings: async () => current,
      change: async (patch) => { changes.push(patch); if (patch.statusHooks !== undefined) current = { ...current, statusHooks: patch.statusHooks }; return current },
    })
    await agents.refresh()
    render(<AgentsPanel agents={agents} />)
    const group = screen.getByRole('radiogroup', { name: 'Agent status hooks' })
    expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe('On')
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Off' })) })
    expect(changes).toContainEqual({ statusHooks: false })
  })
})
