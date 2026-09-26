/** Open a chat session by id, resolved lazily so the port survives the sessions service coming and going. */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

export interface SessionNavigator {
  /** @returns false when the sessions service is not available yet. */
  open(sessionId: string): boolean
}

export function createSessionNavigator(getSessions: () => ISessions | undefined): SessionNavigator {
  return {
    open(sessionId) {
      const sessions = getSessions()
      if (sessions === undefined) return false
      sessions.open(sessionId as Parameters<ISessions['open']>[0])
      return true
    },
  }
}
