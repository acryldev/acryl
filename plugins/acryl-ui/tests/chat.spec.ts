import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { ChatSessionId } from '../src/frame.ts'
import * as client from '../src/client/index.ts'

const SID = 's-1' as ChatSessionId

interface SessionState {
  blank: boolean
  awaitingFirstTurn: boolean
  promptAttempted: boolean
  running: boolean
}

const startPage = (): SessionState => ({ blank: true, awaitingFirstTurn: true, promptAttempted: false, running: false })

/** `@acryl/ui`'s client on real Cordis with DSH's session and conversation services faked down to the reads `acrylChat` makes. */
async function mount(session: SessionState, activeTargets: Set<string> = new Set()) {
  const ctx = new Context()
  const notices: Array<[string, string]> = []
  const scope = {}
  ctx.provide('sessions' as never, {
    scope: (id: unknown) => id === SID ? scope : undefined,
    sessionOf: (actx: unknown) => actx === scope ? { getSnapshot: () => session } : undefined,
  } as never)
  ctx.provide('uiConversation' as never, { binding: () => ({ snapshot: { getSnapshot: () => ({ views: {}, activeTargets }) } }) } as never)
  ctx.provide('conversation' as never, {
    input: { for: (actx: unknown) => ({ notify: (level: string, text: string) => { if (actx === scope) notices.push([level, text]) } }) },
  } as never)
  ctx.provide('theme' as never, { overrideTokens: () => () => {} } as never)
  const fiber = ctx.plugin(client)
  await fiber
  return { ctx, notices, fiber }
}

describe('acrylChat: the chat as ACRYL client plugins see it', () => {
  it('reads the start page as blank and a drawn conversation as engaging or active, by DSH\'s own phase rule', async () => {
    expect((await mount(startPage())).ctx.acrylChat.phase(SID)).toBe('blank')
    expect((await mount({ ...startPage(), promptAttempted: true })).ctx.acrylChat.phase(SID)).toBe('engaging')
    expect((await mount({ ...startPage(), blank: false, awaitingFirstTurn: false })).ctx.acrylChat.phase(SID)).toBe('active')
    expect((await mount({ ...startPage(), running: true })).ctx.acrylChat.phase(SID)).toBe('active')
    expect((await mount(startPage(), new Set(['chat']))).ctx.acrylChat.phase(SID)).toBe('active')
  })

  it('shows a notice under the composer of a known session and refuses an unknown one', async () => {
    const { ctx, notices } = await mount(startPage())
    expect(ctx.acrylChat.notice(SID, 'error', 'no such plugin')).toBe(true)
    expect(ctx.acrylChat.phase('s-other' as ChatSessionId)).toBeUndefined()
    expect(ctx.acrylChat.notice('s-other' as ChatSessionId, 'info', 'elsewhere')).toBe(false)
    expect(notices).toEqual([['error', 'no such plugin']])
  })

  it('is withdrawn when the plugin unloads', async () => {
    const { ctx, fiber } = await mount(startPage())
    await fiber.dispose()
    expect(ctx.get('acrylChat')).toBeUndefined()
  })
})
