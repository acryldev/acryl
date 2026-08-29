import { describe, expect, it, vi } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { GoalProjection } from '@deepseek-ai/dsh-goal'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { TuiStore } from '../../src/tui/store.js'

function event(seq: number): SessionEvent {
  return { type: 'user/message', seq, time: 0, data: { source: { kind: 'user' }, content: [] } } as unknown as SessionEvent
}

function chunkEvent(seq: number, turn: number, step: number, chunk: unknown): SessionEvent {
  return { type: 'assistant/chunk', seq, time: 0, data: { turn, step, chunk } } as unknown as SessionEvent
}

function assistantMessageEvent(seq: number, turn: number, step: number): SessionEvent {
  return {
    type: 'assistant/message',
    seq,
    time: 0,
    data: { turn, step, message: { role: 'assistant', content: [] } },
  } as unknown as SessionEvent
}

function toolCallEvent(seq: number, callId: string, name: string, args: string): SessionEvent {
  return { type: 'tool/call', seq, time: 0, data: { turn: 1, step: 1, callId, name, arguments: args } } as unknown as SessionEvent
}

function toolResultEvent(seq: number, callId: string): SessionEvent {
  return {
    type: 'tool/result',
    seq,
    time: 0,
    data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', content: [], isError: false }] } },
  } as unknown as SessionEvent
}

describe('TuiStore construction', () => {
  it('seeds replayThrough from the last seeded event', () => {
    const store = new TuiStore({ events: [event(1), event(2), event(5)] })
    expect(store.getSnapshot().replayThrough).toBe(5)
  })

  it('starts replayThrough at 0 for an empty session', () => {
    const store = new TuiStore({ events: [] })
    expect(store.getSnapshot().replayThrough).toBe(0)
  })
})

describe('TuiStore.appendEvent', () => {
  it('appends and notifies for a seq greater than the current max', () => {
    const store = new TuiStore({ events: [event(1)] })
    const listener = vi.fn()
    store.subscribe(listener)

    store.appendEvent(event(2))

    expect(store.getSnapshot().events.map(e => e.seq)).toEqual([1, 2])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('silently drops a duplicate/out-of-order seq', () => {
    const store = new TuiStore({ events: [event(1), event(2)] })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.appendEvent(event(2))
    store.appendEvent(event(1))

    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('TuiStore streaming', () => {
  it('folds text-delta chunks into streaming.text without adding to events', () => {
    const store = new TuiStore({ events: [] })

    store.appendEvent(chunkEvent(1, 1, 1, { type: 'block-start', index: 0, blockType: 'text' }))
    store.appendEvent(chunkEvent(2, 1, 1, { type: 'text-delta', index: 0, text: 'Hel' }))
    store.appendEvent(chunkEvent(3, 1, 1, { type: 'text-delta', index: 0, text: 'lo' }))

    const snapshot = store.getSnapshot()
    expect(snapshot.streaming).toEqual({ turn: 1, step: 1, text: 'Hello', reasoningText: '' })
    expect(snapshot.events).toEqual([])
  })

  it('resets the accumulator when turn/step changes', () => {
    const store = new TuiStore({ events: [] })

    store.appendEvent(chunkEvent(1, 1, 1, { type: 'block-start', index: 0, blockType: 'text' }))
    store.appendEvent(chunkEvent(2, 1, 1, { type: 'text-delta', index: 0, text: 'first step' }))
    store.appendEvent(chunkEvent(3, 1, 2, { type: 'block-start', index: 0, blockType: 'text' }))
    store.appendEvent(chunkEvent(4, 1, 2, { type: 'text-delta', index: 0, text: 'second step' }))

    expect(store.getSnapshot().streaming).toEqual({ turn: 1, step: 2, text: 'second step', reasoningText: '' })
  })

  it('folds reasoning-delta chunks into streaming.reasoningText alongside text', () => {
    const store = new TuiStore({ events: [] })

    store.appendEvent(chunkEvent(1, 1, 1, { type: 'block-start', index: 0, blockType: 'reasoning' }))
    store.appendEvent(chunkEvent(2, 1, 1, { type: 'reasoning-delta', index: 0, text: 'weighing op' }))
    store.appendEvent(chunkEvent(3, 1, 1, { type: 'reasoning-delta', index: 0, text: 'tions' }))
    store.appendEvent(chunkEvent(4, 1, 1, { type: 'block-start', index: 1, blockType: 'text' }))
    store.appendEvent(chunkEvent(5, 1, 1, { type: 'text-delta', index: 1, text: 'answer' }))

    expect(store.getSnapshot().streaming).toEqual({ turn: 1, step: 1, text: 'answer', reasoningText: 'weighing options' })
  })

  it('assistant/message clears streaming and appends the settled event', () => {
    const store = new TuiStore({ events: [] })

    store.appendEvent(chunkEvent(1, 1, 1, { type: 'block-start', index: 0, blockType: 'text' }))
    store.appendEvent(chunkEvent(2, 1, 1, { type: 'text-delta', index: 0, text: 'partial' }))
    store.appendEvent(assistantMessageEvent(3, 1, 1))

    const snapshot = store.getSnapshot()
    expect(snapshot.streaming).toBeUndefined()
    expect(snapshot.events.map(e => e.seq)).toEqual([3])
  })

  it('drops persisted assistant/chunk rows from the seeded events without seeding streaming', () => {
    const store = new TuiStore({
      events: [event(1), chunkEvent(2, 1, 1, { type: 'text-delta', index: 0, text: 'stale' }), assistantMessageEvent(3, 1, 1)],
    })

    const snapshot = store.getSnapshot()
    expect(snapshot.events.map(e => e.seq)).toEqual([1, 3])
    expect(snapshot.streaming).toBeUndefined()
    expect(snapshot.replayThrough).toBe(3)
  })
})

describe('TuiStore.getToolCall', () => {
  it('resolves a call seeded from replay', () => {
    const store = new TuiStore({ events: [toolCallEvent(1, 'call-1', 'read_file', '{"path":"/tmp/foo.txt"}')] })
    expect(store.getToolCall(CallId('call-1'))).toEqual({ name: 'read_file', arguments: '{"path":"/tmp/foo.txt"}' })
  })

  it('resolves a call appended live', () => {
    const store = new TuiStore({ events: [] })
    store.appendEvent(toolCallEvent(1, 'call-1', 'bash', '{"command":"ls"}'))
    expect(store.getToolCall(CallId('call-1'))).toEqual({ name: 'bash', arguments: '{"command":"ls"}' })
  })

  it('returns undefined for an unknown callId', () => {
    const store = new TuiStore({ events: [] })
    expect(store.getToolCall(CallId('missing'))).toBeUndefined()
  })
})

describe('TuiStore pending tool calls', () => {
  it('lists a call sent live with no result yet', () => {
    const store = new TuiStore({ events: [] })
    store.appendEvent(toolCallEvent(1, 'call-1', 'bash', '{"command":"ls"}'))
    expect(store.getSnapshot().pendingToolCalls).toEqual([{ callId: 'call-1', name: 'bash', arguments: '{"command":"ls"}' }])
  })

  it('removes a call once its result lands', () => {
    const store = new TuiStore({ events: [] })
    store.appendEvent(toolCallEvent(1, 'call-1', 'bash', '{"command":"ls"}'))
    store.appendEvent(toolResultEvent(2, 'call-1'))
    expect(store.getSnapshot().pendingToolCalls).toEqual([])
  })

  it('keeps concurrent calls in send order, dropping only the one that resolves', () => {
    const store = new TuiStore({ events: [] })
    store.appendEvent(toolCallEvent(1, 'call-1', 'bash', '{"command":"ls"}'))
    store.appendEvent(toolCallEvent(2, 'call-2', 'read_file', '{"path":"a.txt"}'))
    store.appendEvent(toolResultEvent(3, 'call-1'))
    expect(store.getSnapshot().pendingToolCalls).toEqual([{ callId: 'call-2', name: 'read_file', arguments: '{"path":"a.txt"}' }])
  })

  it('seeds pendingToolCalls from replay, reflecting only calls left unresolved by the log so far', () => {
    const store = new TuiStore({
      events: [toolCallEvent(1, 'call-1', 'bash', '{}'), toolResultEvent(2, 'call-1'), toolCallEvent(3, 'call-2', 'read_file', '{}')],
    })
    expect(store.getSnapshot().pendingToolCalls).toEqual([{ callId: 'call-2', name: 'read_file', arguments: '{}' }])
  })
})

describe('TuiStore.setStatus', () => {
  it('is a no-op for the same value', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.setStatus('idle')

    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies on a real transition', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setStatus('running')

    expect(store.getSnapshot().status).toBe('running')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('TuiStore setters without an equality guard', () => {
  it('setQueued always notifies, even with an equal-looking value', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setQueued([])
    store.setQueued([])

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('setNotice updates the field and notifies', () => {
    const store = new TuiStore({ events: [] })
    store.setNotice('hello')
    expect(store.getSnapshot().notice).toBe('hello')
  })

  it('setPermission updates the field and notifies', () => {
    const store = new TuiStore({ events: [] })
    store.setPermission({ current: 'default', names: ['default'] })
    expect(store.getSnapshot().permission).toEqual({ current: 'default', names: ['default'] })
  })

  it('setStats updates the field and notifies', () => {
    const store = new TuiStore({ events: [] })
    const stats = { sessionStats: undefined, tokenUsage: undefined, contextPressure: undefined, contextBreakdown: undefined }
    store.setStats(stats)
    expect(store.getSnapshot().stats).toBe(stats)
  })

  it('setGoal starts undefined and stores the projection, null included', () => {
    const store = new TuiStore({ events: [] })
    expect(store.getSnapshot().goal).toBeUndefined()

    const goal = {
      goal: { id: 'goal-1', revision: 2, objective: 'ship it', phase: 'active', maxGoalRounds: 256 },
      roundsStarted: 1,
      createdAt: 1,
      updatedAt: 2,
    }
    store.setGoal(goal as GoalProjection)
    expect(store.getSnapshot().goal).toBe(goal)

    store.setGoal(null)
    expect(store.getSnapshot().goal).toBeNull()
  })

  it('setTitle starts undefined and stores the title, null included', () => {
    const store = new TuiStore({ events: [] })
    expect(store.getSnapshot().title).toBeUndefined()

    store.setTitle('Read-only agent preset creation')
    expect(store.getSnapshot().title).toBe('Read-only agent preset creation')

    store.setTitle(null)
    expect(store.getSnapshot().title).toBeNull()
  })

  it('setPreset updates the field and notifies', () => {
    const store = new TuiStore({ events: [] })
    store.setPreset({ current: 'Code mode', blank: true })
    expect(store.getSnapshot().preset).toEqual({ current: 'Code mode', blank: true })
  })

  it('setUpdateHint starts undefined and stores the newer version found by the startup check', () => {
    const store = new TuiStore({ events: [] })
    expect(store.getSnapshot().updateHint).toBeUndefined()

    store.setUpdateHint('0.7.0')
    expect(store.getSnapshot().updateHint).toBe('0.7.0')

    store.setUpdateHint(undefined)
    expect(store.getSnapshot().updateHint).toBeUndefined()
  })
})

describe('TuiStore shell runs', () => {
  it('startShellRun opens a live run and returns its id', () => {
    const store = new TuiStore({ events: [] })
    const id = store.startShellRun('ls')
    expect(store.getSnapshot().shellRun).toEqual({ id, command: 'ls', output: '' })
    expect(store.getSnapshot().shellHistory).toEqual([])
  })

  it('appendShellOutput accumulates onto the live run', () => {
    const store = new TuiStore({ events: [] })
    const id = store.startShellRun('ls')
    store.appendShellOutput(id, 'a.txt\n')
    store.appendShellOutput(id, 'b.txt\n')
    expect(store.getSnapshot().shellRun?.output).toBe('a.txt\nb.txt\n')
  })

  it('appendShellOutput ignores a stale id once the run has settled', () => {
    const store = new TuiStore({ events: [] })
    const id = store.startShellRun('ls')
    store.finishShellRun(id, 0)
    store.appendShellOutput(id, 'too late')
    expect(store.getSnapshot().shellRun).toBeUndefined()
    expect(store.getSnapshot().shellHistory[0].output).toBe('')
  })

  it('finishShellRun settles the live run into shellHistory, ordered after the events seen so far', () => {
    const store = new TuiStore({ events: [event(1), event(2)] })
    const id = store.startShellRun('ls')
    store.appendShellOutput(id, 'a.txt\n')

    store.finishShellRun(id, 0)

    expect(store.getSnapshot().shellRun).toBeUndefined()
    expect(store.getSnapshot().shellHistory).toEqual([{ id, command: 'ls', output: 'a.txt\n', exitCode: 0, afterSeq: 2 }])
  })

  it('finishShellRun is a no-op for an id that is not the current live run', () => {
    const store = new TuiStore({ events: [] })
    store.finishShellRun(999, 0)
    expect(store.getSnapshot().shellHistory).toEqual([])
  })
})

describe('TuiStore.subscribe', () => {
  it('stops notifying after the returned disposer is called', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.setStatus('running')

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('TuiStore overlay state machine', () => {
  it('openModelProfile opens a loading provider list', () => {
    const store = new TuiStore({ events: [] })
    store.openModelProfile()
    const overlay = store.getSnapshot().overlay
    expect(overlay.kind).toBe('modelProfile')
    if (overlay.kind === 'modelProfile') {
      expect(overlay.modelProfile.view).toBe('list')
      expect(overlay.modelProfile.busy).toBe(true)
      expect(overlay.modelProfile.providers).toBeUndefined()
    }
  })

  it('closeOverlay restores the closed state', () => {
    const store = new TuiStore({ events: [] })
    store.openModelProfile()
    store.closeOverlay()
    expect(store.getSnapshot().overlay).toEqual({ kind: 'none' })
  })

  it('openApproval opens the approval overlay with the given prompt', () => {
    const store = new TuiStore({ events: [] })
    const approval = { toolName: 'bash', callId: 'call-1', reason: 'runs a shell command' }

    store.openApproval(approval)

    expect(store.getSnapshot().overlay).toEqual({ kind: 'approval', approval })
  })

  it('openUserQuestion opens the question overlay with the given prompt', () => {
    const store = new TuiStore({ events: [] })
    const userQuestion = {
      header: 'Confirm',
      question: 'Proceed?',
      detail: undefined,
      options: [{ label: 'Yes', description: undefined }],
      multiSelect: false,
      approveLabel: undefined,
      progress: undefined,
    }

    store.openUserQuestion(userQuestion)

    expect(store.getSnapshot().overlay).toEqual({ kind: 'userQuestion', userQuestion })
  })

  it('openApproval replaces whatever overlay was previously open', () => {
    const store = new TuiStore({ events: [] })
    store.openContext()

    store.openApproval({ toolName: 'bash', callId: undefined, reason: undefined })

    expect(store.getSnapshot().overlay.kind).toBe('approval')
  })

  it('openContext opens the context overlay', () => {
    const store = new TuiStore({ events: [] })
    store.openContext()
    expect(store.getSnapshot().overlay).toEqual({ kind: 'context' })
  })

  it('openPlugins opens the plugins overlay with the given rows', () => {
    const store = new TuiStore({ events: [] })
    const rows = [{ id: 'tui', name: '@tomowang/dsh-tui', disabled: false, group: false, state: 'active' as const }]

    store.openPlugins(rows)

    expect(store.getSnapshot().overlay).toEqual({ kind: 'plugins', rows })
  })

  it('openAgentPresets opens a loading roster seeded with the session state', () => {
    const store = new TuiStore({ events: [] })
    store.openAgentPresets({ current: 'standard', blank: true })
    const overlay = store.getSnapshot().overlay
    expect(overlay.kind).toBe('agentPresets')
    if (overlay.kind === 'agentPresets') {
      expect(overlay.agentPresets).toEqual({ rows: [], selected: 0, current: 'standard', blank: true, busy: true, error: undefined })
    }
  })

  it('updateAgentPresets is a no-op while the overlay is closed', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.updateAgentPresets({ busy: false })

    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('updateAgentPresets merges a patch onto the open overlay', () => {
    const store = new TuiStore({ events: [] })
    store.openAgentPresets({ current: undefined, blank: true })
    const rows = [{ id: 'standard', label: 'Standard mode', description: undefined, trust: 'system' as const, broken: undefined }]

    store.updateAgentPresets({ rows, busy: false })

    const overlay = store.getSnapshot().overlay
    expect(overlay.kind).toBe('agentPresets')
    if (overlay.kind === 'agentPresets') {
      expect(overlay.agentPresets.rows).toBe(rows)
      expect(overlay.agentPresets.busy).toBe(false)
      // Untouched fields survive the merge.
      expect(overlay.agentPresets.blank).toBe(true)
    }
  })

  it('selectAgentPresetRow moves the overlay cursor', () => {
    const store = new TuiStore({ events: [] })
    store.openAgentPresets({ current: undefined, blank: true })

    store.selectAgentPresetRow(2)

    const overlay = store.getSnapshot().overlay
    expect(overlay.kind).toBe('agentPresets')
    if (overlay.kind === 'agentPresets') expect(overlay.agentPresets.selected).toBe(2)
  })

  it('updateModelProfile is a no-op while the overlay is closed', () => {
    const store = new TuiStore({ events: [] })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.updateModelProfile({ busy: false })

    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('updateModelProfile merges a patch onto the open overlay', () => {
    const store = new TuiStore({ events: [] })
    store.openModelProfile()

    store.updateModelProfile({ busy: false, error: 'boom' })

    const overlay = store.getSnapshot().overlay
    expect(overlay.kind).toBe('modelProfile')
    if (overlay.kind === 'modelProfile') {
      expect(overlay.modelProfile.busy).toBe(false)
      expect(overlay.modelProfile.error).toBe('boom')
      // Untouched fields survive the merge.
      expect(overlay.modelProfile.view).toBe('list')
    }
  })
})
