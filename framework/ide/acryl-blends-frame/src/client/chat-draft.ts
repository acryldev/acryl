/**
 * Writing into the chat's composer: DSH's conversation input for a session (`conversation.input.for(scope).setDraft`), the same seam
 * `@acryl/ui`'s `acrylChat.notice` uses. The services are read at the call and checked, so a page without a chat answers false.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { DraftAttachmentId } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ISessions } from '@acryl/ui/frame'

type SessionId = Parameters<ISessions['scope']>[0]

interface ComposerInput {
  setDraft(text: string): void
  focus(): void
}

function composerOf(conversation: unknown, scope: unknown): ComposerInput | undefined {
  const input = conversation !== null && typeof conversation === 'object' ? (conversation as { input?: unknown }).input : undefined
  const resolve = input !== null && typeof input === 'object' ? (input as { for?: unknown }).for : undefined
  if (typeof resolve !== 'function') return undefined
  const composer: unknown = resolve.call(input, scope)
  if (composer === null || typeof composer !== 'object') return undefined
  const { setDraft, focus } = composer as { setDraft?: unknown; focus?: unknown }
  return typeof setDraft === 'function' && typeof focus === 'function' ? (composer as ComposerInput) : undefined
}

/** Put `text` in the composer of chat `sessionId` and focus it. @returns false when this page holds no composer for that chat. */
export function draftInChat(ctx: Context, sessionId: string, text: string): boolean {
  const scope = ctx.get('sessions')?.scope(sessionId as SessionId)
  if (scope === undefined) return false
  const composer = composerOf(ctx.get('conversation'), scope)
  if (composer === undefined) return false
  composer.setDraft(text)
  composer.focus()
  return true
}

/** DSH's browser attachment intake (ConversationController.createDrafts), the seam ui-attachment uses; IConversation's public face does not list it. */
interface DraftIntake {
  createDrafts(sessionId: SessionId, files: readonly File[]): readonly { readonly id: DraftAttachmentId }[]
}

/**
 * Attach one browser file to a chat's composer as DSH's own draft attachment, so the composer shows it and sending includes it.
 * @param ctx - the frame's client context.
 * @param sessionId - the chat to attach it to.
 * @param file - the browser file (an image keeps its type and bytes for the model).
 * @returns false when the page holds no attachment intake or no composer for that chat.
 */
export function attachDraft(ctx: Context, sessionId: string, file: File): boolean {
  const scope = ctx.get('sessions')?.scope(sessionId as SessionId)
  if (scope === undefined) return false
  const conversation = scope.get('conversation')
  if (conversation === undefined) return false
  const create = (conversation as unknown as Partial<DraftIntake>).createDrafts
  if (typeof create !== 'function') return false
  const drafts = create.call(conversation, sessionId as SessionId, [file])
  const composer = conversation.input.for(scope)
  return drafts.length > 0 && composer.addAttachments(drafts.map(draft => draft.id))
}
