/**
 * ACRYL's "main session" over DSH 0.2's session contract.
 *
 * 0.1.5 had `ISessions.open(id)` and `SessionListState.current`. 0.2 removed both: navigation belongs to the view owner, and a session
 * is "the main view" while some holder retains it with `source: 'mainView'` (`retain(target, { source })`). ACRYL's tab strip and
 * Projects panel are such a view owner, so they hold the reference here and read the current session back from `retainedBy`.
 */

import type { ISessions, SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'

type SessionId = Parameters<ISessions['retain']>[0]

/** One held reference per sessions service, so a re-opened service (engine swap) never leaks the previous retain. */
const held = new WeakMap<ISessions, SessionReference>()

/** The session some view currently retains as the main view, if any. */
export function currentSessionId(list: SessionListState): SessionListState['ids'][number] | undefined {
  return list.ids.find(id => (list.byId[id]?.retainedBy.mainView ?? 0) > 0)
}

/** Make `sessionId` the main view: retain it first, then release the one this owner held before, so there is never a gap. */
export function openMainSession(sessions: ISessions, sessionId: string): void {
  const next = sessions.retain(sessionId as SessionId, { source: 'mainView' })
  const previous = held.get(sessions)
  held.set(sessions, next)
  previous?.release()
}
