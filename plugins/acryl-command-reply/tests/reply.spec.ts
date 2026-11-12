import { Context } from '@deepseek-ai/cordis'
import type { AcrylChat, ChatPhase, ChatSessionId } from '@acryl/ui/frame'
import type { CommandResult } from '@deepseek-ai/dsh-commands/types'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/client/index.ts'

const SID = 's-1' as ChatSessionId

/** A fake `acrylChat` with one session in `phase`; `notices` records what reached the composer. */
async function mount(phase: ChatPhase) {
  const ctx = new Context()
  const notices: Array<[string, string]> = []
  const chat: AcrylChat = {
    phase: (sessionId) => sessionId === SID ? phase : undefined,
    notice: (sessionId, level, text) => { if (sessionId !== SID) return false; notices.push([level, text]); return true },
  }
  ctx.provide('acrylChat' as never, chat as never)
  const fiber = ctx.plugin(plugin)
  await fiber
  const executed = (sessionId: string, result: CommandResult) => ctx.emit('command/executed', sessionId as ChatSessionId, 'probe', result)
  return { notices, fiber, executed }
}

describe('a host command reply on the start page (spec 049 T002)', () => {
  it('is shown as the composer notice while the session is blank, an error as an error', async () => {
    const { notices, executed } = await mount('blank')
    executed(SID, { kind: 'success', text: 'probe-state: clicks=1' })
    executed(SID, { kind: 'error', text: 'no such plugin' })
    expect(notices).toEqual([['info', 'probe-state: clicks=1'], ['error', 'no such plugin']])
  })

  it('is left to the conversation once it is drawn', async () => {
    for (const phase of ['engaging', 'active'] as const) {
      const { notices, executed } = await mount(phase)
      executed(SID, { kind: 'success', text: 'done' })
      expect(notices).toEqual([])
    }
  })

  it('shows nothing for a reply without text, or for a session the chat does not know', async () => {
    const { notices, executed } = await mount('blank')
    executed(SID, { kind: 'success' })
    executed(SID, { kind: 'success', text: '  ' })
    executed('s-other', { kind: 'success', text: 'elsewhere' })
    expect(notices).toEqual([])
  })

  it('stops when its plugin is unloaded', async () => {
    const { notices, fiber, executed } = await mount('blank')
    await fiber.dispose()
    executed(SID, { kind: 'success', text: 'late' })
    expect(notices).toEqual([])
  })
})
