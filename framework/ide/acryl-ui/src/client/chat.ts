/**
 * The `acrylChat` service (declared in `../frame.ts`): the chat's phase and composer notice for ACRYL's client plugins, read from DSH's own conversation and
 * session services here so the plugins name no DSH package. Part of the DSH seam (scripts/verify-layout.mjs).
 */
import type { Context } from '@deepseek-ai/cordis'
import { conversationPhase } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AcrylChat, ChatSessionId } from '../frame.ts'

/**
 * The service over this page's chat. The DSH services are read at each call, so a page that has none of them yet answers undefined and false.
 * @param ctx - the client context that provides it.
 * @returns the service.
 */
export function createAcrylChat(ctx: Context): AcrylChat {
  const scopeOf = (sessionId: ChatSessionId) => ctx.get('sessions')?.scope(sessionId)
  return {
    phase(sessionId) {
      const scope = scopeOf(sessionId)
      const session = scope === undefined ? undefined : ctx.get('sessions')?.sessionOf(scope)?.getSnapshot()
      const conversation = ctx.get('uiConversation')?.binding(sessionId).snapshot.getSnapshot()
      if (session === undefined || conversation === undefined) return undefined
      return conversationPhase(session, conversation)
    },
    notice(sessionId, level, text) {
      const scope = scopeOf(sessionId)
      const conversation = ctx.get('conversation')
      if (scope === undefined || conversation === undefined) return false
      conversation.input.for(scope).notify(level, text)
      return true
    },
  }
}

/**
 * Provide `acrylChat` for one plugin lifetime.
 * @param ctx - the client context.
 * @returns the disposer of the registration.
 */
export function provideAcrylChat(ctx: Context): () => void {
  const dispose = ctx.reflect.provide('acrylChat', createAcrylChat(ctx))
  return () => { void dispose() }
}
