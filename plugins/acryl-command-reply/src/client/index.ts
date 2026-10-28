/**
 * A host command's reply on the start page (spec 049 T002). DSH draws a command's reply as a node in the conversation, and the conversation is not
 * drawn while a session is blank (the start page: no prompt sent yet), so `/reload new` or a plugin's own command answered there and nothing showed.
 * While the session is blank, this plugin shows the reply as the composer notice, the line the composer already uses for a command it refused; once
 * the conversation is drawn, the reply node shows it and this plugin stays out of the way.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import { conversationPhase } from '@deepseek-ai/dsh-client-ui-conversation/client'

export const name = 'acryl-command-reply-client'
export const inject = ['sessions', 'conversation', 'uiConversation']

export function apply(ctx: ClientContext): void {
  ctx.on('command/executed', (sessionId, _name, result) => {
    const text = result.text?.trim() ?? ''
    if (text === '') return
    const scope = ctx.sessions.scope(sessionId)
    const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)?.getSnapshot()
    if (scope === undefined || session === undefined) return
    if (conversationPhase(session, ctx.uiConversation.binding(sessionId).snapshot.getSnapshot()) !== 'blank') return
    ctx.conversation.input.for(scope).notify(result.kind === 'error' ? 'error' : 'info', text)
  })
}
