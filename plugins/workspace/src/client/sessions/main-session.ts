/**
 * ACRYL's "main session" over DSH 0.2's session contract.
 *
 * 0.1.5 had `ISessions.open(id)` and `SessionListState.current`. 0.2 removed both: a session is "the main view" while some holder
 * retains it with `source: 'mainView'`, and DSH's conversation keeps showing its current session for as long as anything still holds
 * it. DSH's own navigation (`uiWorkspace`, `dsh-client-ui-workspace`) is one such holder, and it never releases its hold for a
 * switch made elsewhere: a second, parallel hold taken here left DSH's hold on the old session in place, so every chat tab and every
 * chat picked in the tree went on showing that old session. ACRYL therefore asks DSH's navigation to open the session (one owner of
 * the selection, the previous hold released by it), and holds a reference itself only where that navigation is not composed.
 */

import type { ISessions, SessionListState, SessionReference } from '@acryl/ui/frame'

type SessionId = Parameters<ISessions['retain']>[0]

/** The share of DSH's `uiWorkspace` service used here: select a session and show its conversation, as one navigation action. */
export interface MainViewNavigation {
  openSession(target: SessionId): void
}

/** One held reference per sessions service, so a re-opened service (engine swap) never leaks the previous retain. */
const held = new WeakMap<ISessions, SessionReference>()

/** The session some view currently retains as the main view, if any. */
export function currentSessionId(list: SessionListState): SessionListState['ids'][number] | undefined {
  return list.ids.find(id => (list.byId[id]?.retainedBy.mainView ?? 0) > 0)
}

/**
 * Make `sessionId` the main view. Through DSH's navigation when it is composed (it releases the session it held before); otherwise
 * retain it here first and then release the one held before, so there is never a gap.
 */
export function openMainSession(sessions: ISessions, sessionId: string, navigation?: MainViewNavigation): void {
  if (navigation !== undefined) {
    navigation.openSession(sessionId as SessionId)
    // A hold taken here before the navigation was available must not keep an older session on screen.
    held.get(sessions)?.release()
    held.delete(sessions)
    return
  }
  const next = sessions.retain(sessionId as SessionId, { source: 'mainView' })
  const previous = held.get(sessions)
  held.set(sessions, next)
  previous?.release()
}
