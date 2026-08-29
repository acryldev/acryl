import { describe, expect, it, vi } from 'vitest'
import type { TuiActions } from '../../src/tui/actions.js'
import { matchSlashCommands, parseGoalCommand, parsePlanCommand, runSlashCommand } from '../../src/tui/commands.js'

function stubActions(): TuiActions {
  return {
    send: vi.fn(),
    cancel: vi.fn(),
    shutdown: vi.fn(),
    help: vi.fn(),
    recordHistory: vi.fn(),
    clear: vi.fn(),
    cyclePermission: vi.fn(),
    compact: vi.fn(),
    plan: vi.fn(),
    goal: vi.fn(),
    runShell: vi.fn(),
    ensureFileIndex: vi.fn(),
    openModelProfile: vi.fn(),
    closeModelProfile: vi.fn(),
    backToProviderList: vi.fn(),
    selectProvider: vi.fn(),
    createProvider: vi.fn(),
    editProvider: vi.fn(),
    saveProvider: vi.fn(),
    deleteProvider: vi.fn(),
    discoverModelsForDraft: vi.fn(),
    setActiveModel: vi.fn(),
    openTrajectory: vi.fn(),
    closeTrajectory: vi.fn(),
    openToolCards: vi.fn(),
    closeToolCards: vi.fn(),
    openContext: vi.fn(),
    closeContext: vi.fn(),
    openPlugins: vi.fn(),
    closePlugins: vi.fn(),
    openAgentPresets: vi.fn(),
    closeAgentPresets: vi.fn(),
    selectAgentPresetRow: vi.fn(),
    applyAgentPreset: vi.fn(),
    answerApproval: vi.fn(),
    answerQuestion: vi.fn(),
  }
}

function totalCalls(actions: TuiActions): number {
  return Object.values(actions).reduce((total, fn) => total + (fn as ReturnType<typeof vi.fn>).mock.calls.length, 0)
}

describe('matchSlashCommands', () => {
  it('filters by prefix', () => {
    expect(matchSlashCommands('/m').map(c => c.command)).toEqual(['/model'])
  })

  it('matches every command against the bare slash', () => {
    expect(matchSlashCommands('/').length).toBeGreaterThanOrEqual(5)
  })

  it('matches a command against its own full text', () => {
    expect(matchSlashCommands('/compact').map(c => c.command)).toEqual(['/compact'])
  })

  it('returns nothing for a non-matching query', () => {
    expect(matchSlashCommands('/nope')).toEqual([])
  })

  it('is case-sensitive', () => {
    expect(matchSlashCommands('/M')).toEqual([])
  })

  it('matches /plan against its own full text', () => {
    expect(matchSlashCommands('/plan').map(c => c.command)).toEqual(['/plan'])
  })
})

describe('parsePlanCommand', () => {
  it('returns an empty argument for bare /plan', () => {
    expect(parsePlanCommand('/plan')).toBe('')
  })

  it('trims surrounding whitespace off the bare command', () => {
    expect(parsePlanCommand('  /plan  ')).toBe('')
  })

  it('returns the off argument verbatim', () => {
    expect(parsePlanCommand('/plan off')).toBe('off')
  })

  it('returns an arbitrary message argument, trimmed', () => {
    expect(parsePlanCommand('/plan investigate the auth bug first ')).toBe('investigate the auth bug first')
  })

  it('does not match a longer command sharing the /plan prefix', () => {
    expect(parsePlanCommand('/plans')).toBeUndefined()
  })

  it('does not match plain text', () => {
    expect(parsePlanCommand('not a command')).toBeUndefined()
  })

  it('does not match an unrelated command', () => {
    expect(parsePlanCommand('/compact')).toBeUndefined()
  })
})

describe('parseGoalCommand', () => {
  it('parses bare /goal as show', () => {
    expect(parseGoalCommand('/goal')).toEqual({ kind: 'show' })
  })

  it('trims surrounding whitespace off the bare command', () => {
    expect(parseGoalCommand('  /goal  ')).toEqual({ kind: 'show' })
  })

  it('parses any other text as a create objective, trimmed', () => {
    expect(parseGoalCommand('/goal ship the release ')).toEqual({ kind: 'create', objective: 'ship the release' })
  })

  it('parses the control words clear/pause/resume', () => {
    expect(parseGoalCommand('/goal clear')).toEqual({ kind: 'clear' })
    expect(parseGoalCommand('/goal pause')).toEqual({ kind: 'pause' })
    expect(parseGoalCommand('/goal resume')).toEqual({ kind: 'resume' })
  })

  it('is case-insensitive for the control words', () => {
    expect(parseGoalCommand('/goal CLEAR')).toEqual({ kind: 'clear' })
    expect(parseGoalCommand('/goal Pause')).toEqual({ kind: 'pause' })
    expect(parseGoalCommand('/goal RESUME')).toEqual({ kind: 'resume' })
  })

  it('treats bare edit as invalid-edit', () => {
    expect(parseGoalCommand('/goal edit')).toEqual({ kind: 'invalid-edit' })
  })

  it('parses "edit <objective>" as an edit, case-insensitively', () => {
    expect(parseGoalCommand('/goal edit ship the docs')).toEqual({ kind: 'edit', objective: 'ship the docs' })
    expect(parseGoalCommand('/goal EDIT ship the docs')).toEqual({ kind: 'edit', objective: 'ship the docs' })
  })

  it('does not match a longer command sharing the /goal prefix', () => {
    expect(parseGoalCommand('/goals')).toBeUndefined()
  })

  it('does not match plain text or another command', () => {
    expect(parseGoalCommand('not a command')).toBeUndefined()
    expect(parseGoalCommand('/plan off')).toBeUndefined()
  })
})

describe('runSlashCommand', () => {
  it('dispatches /exit to shutdown', () => {
    const actions = stubActions()
    runSlashCommand('/exit', actions)
    expect(actions.shutdown).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /quit to shutdown', () => {
    const actions = stubActions()
    runSlashCommand('/quit', actions)
    expect(actions.shutdown).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /help to help', () => {
    const actions = stubActions()
    runSlashCommand('/help', actions)
    expect(actions.help).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /clear to clear', () => {
    const actions = stubActions()
    runSlashCommand('/clear', actions)
    expect(actions.clear).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /model to openModelProfile', () => {
    const actions = stubActions()
    runSlashCommand('/model', actions)
    expect(actions.openModelProfile).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /trajectory to openTrajectory', () => {
    const actions = stubActions()
    runSlashCommand('/trajectory', actions)
    expect(actions.openTrajectory).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /context to openContext', () => {
    const actions = stubActions()
    runSlashCommand('/context', actions)
    expect(actions.openContext).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /plugins to openPlugins', () => {
    const actions = stubActions()
    runSlashCommand('/plugins', actions)
    expect(actions.openPlugins).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /presets to openAgentPresets', () => {
    const actions = stubActions()
    runSlashCommand('/presets', actions)
    expect(actions.openAgentPresets).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('dispatches /compact to compact', () => {
    const actions = stubActions()
    runSlashCommand('/compact', actions)
    expect(actions.compact).toHaveBeenCalledTimes(1)
    expect(totalCalls(actions)).toBe(1)
  })

  it('calls nothing for an unrecognized command', () => {
    const actions = stubActions()
    runSlashCommand('/nope', actions)
    expect(totalCalls(actions)).toBe(0)
  })

  it('does not dispatch /plan — CustomEditor routes it through parsePlanCommand/actions.plan instead', () => {
    const actions = stubActions()
    runSlashCommand('/plan', actions)
    expect(totalCalls(actions)).toBe(0)
  })

  it('does not dispatch /goal — CustomEditor routes it through parseGoalCommand/actions.goal instead', () => {
    const actions = stubActions()
    runSlashCommand('/goal', actions)
    expect(totalCalls(actions)).toBe(0)
  })
})
