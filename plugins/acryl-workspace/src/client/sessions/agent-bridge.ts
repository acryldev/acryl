/** Send a message to the agent of the chat session that is currently open. */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

export type SendResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface AgentBridge {
  /**
   * Deliver `text` as a user turn queued after whatever the agent is doing. The session log is
   * the durable record of it.
   */
  sendToCurrentSession(text: string): Promise<SendResult>
}

function failureReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'the agent did not accept the message'
}

/**
 * @param getSessions - resolves the sessions service when it is needed; undefined while it is not
 * available, so the bridge reports that instead of holding a stale reference.
 */
export function createAgentBridge(getSessions: () => ISessions | undefined): AgentBridge {
  return {
    async sendToCurrentSession(text) {
      const sessions = getSessions()
      if (sessions === undefined) return { ok: false, reason: 'chat sessions are not available yet' }
      const current = sessions.list.getSnapshot().current
      if (current === undefined) return { ok: false, reason: 'open a chat first, then send the comment' }
      const scope = sessions.scope(current)
      const face = scope === undefined ? undefined : sessions.sessionOf(scope)
      if (face === undefined) return { ok: false, reason: 'the current chat is not ready to receive messages' }
      try {
        const result = await face.prompt([{ type: 'text', text }], 'queue')
        return result.ok ? { ok: true } : { ok: false, reason: failureReason(result.error) }
      } catch (cause) {
        return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
      }
    },
  }
}
