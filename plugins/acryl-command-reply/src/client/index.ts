/**
 * A host command's reply on the start page (spec 049 T002). DSH draws a command's reply as a node in the conversation, and the conversation is not
 * drawn while a session is blank (the start page: no prompt sent yet), so `/reload new` or a plugin's own command answered there and nothing showed.
 * While the session is blank, this plugin shows the reply as the composer notice, the line the composer already uses for a command it refused; once
 * the conversation is drawn, the reply node shows it and this plugin stays out of the way. The chat is read through `@acryl/ui`'s `acrylChat`, so
 * this plugin names no DSH package.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@acryl/ui/frame'

export const name = 'acryl-command-reply-client'
export const inject = ['acrylChat']

export function apply(ctx: ClientContext): void {
  ctx.on('command/executed', (sessionId, _name, result) => {
    const text = result.text?.trim() ?? ''
    if (text === '' || ctx.acrylChat.phase(sessionId) !== 'blank') return
    ctx.acrylChat.notice(sessionId, result.kind === 'error' ? 'error' : 'info', text)
  })
}
