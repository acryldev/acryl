import { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/client/index.ts'

const SID = 's-1' as SessionId

interface Phase {
  blank: boolean
  awaitingFirstTurn: boolean
  promptAttempted: boolean
  running: boolean
  activeTargets: Set<string>
}

/** The client services the plugin injects, faked down to the reads it makes; `notices` records what reached the composer. */
async function mount(phase: Phase) {
  const ctx = new Context()
  const notices: Array<[string, string]> = []
  const scope = {}
  ctx.provide('sessions' as never, {
    scope: (id: unknown) => id === SID ? scope : undefined,
    sessionOf: (actx: unknown) => actx === scope ? { getSnapshot: () => phase } : undefined,
  } as never)
  ctx.provide('uiConversation' as never, { binding: () => ({ snapshot: { getSnapshot: () => ({ views: {}, activeTargets: phase.activeTargets }) } }) } as never)
  ctx.provide('conversation' as never, {
    input: { for: (actx: unknown) => ({ notify: (level: string, text: string) => { if (actx === scope) notices.push([level, text]) } }) },
  } as never)
  const fiber = ctx.plugin(plugin)
  await fiber
  const executed = (sessionId: string, result: CommandResult) => ctx.emit('command/executed', sessionId as SessionId, 'probe', result)
  return { notices, fiber, executed }
}

const startPage = (): Phase => ({ blank: true, awaitingFirstTurn: true, promptAttempted: false, running: false, activeTargets: new Set() })

describe('a host command reply on the start page (spec 049 T002)', () => {
  it('is shown as the composer notice while the session is blank, an error as an error', async () => {
    const { notices, executed } = await mount(startPage())
    executed(SID, { kind: 'success', text: 'probe-state: clicks=1' })
    executed(SID, { kind: 'error', text: 'no such plugin' })
    expect(notices).toEqual([['info', 'probe-state: clicks=1'], ['error', 'no such plugin']])
  })

  it('is left to the conversation once it is drawn: after a prompt, while one runs, or with an active view', async () => {
    for (const phase of [
      { ...startPage(), blank: false, awaitingFirstTurn: false },
      { ...startPage(), promptAttempted: true },
      { ...startPage(), running: true },
      { ...startPage(), activeTargets: new Set(['chat']) },
    ]) {
      const { notices, executed } = await mount(phase)
      executed(SID, { kind: 'success', text: 'done' })
      expect(notices).toEqual([])
    }
  })

  it('shows nothing for a reply without text, or for a session this page has no scope for', async () => {
    const { notices, executed } = await mount(startPage())
    executed(SID, { kind: 'success' })
    executed(SID, { kind: 'success', text: '  ' })
    executed('s-other', { kind: 'success', text: 'elsewhere' })
    expect(notices).toEqual([])
  })

  it('stops when its plugin is unloaded', async () => {
    const { notices, fiber, executed } = await mount(startPage())
    await fiber.dispose()
    executed(SID, { kind: 'success', text: 'late' })
    expect(notices).toEqual([])
  })
})
