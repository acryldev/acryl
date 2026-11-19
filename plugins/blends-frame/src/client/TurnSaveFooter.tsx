/**
 * The line under a chat answer that changed the app: "edited src/routes.ts, src/board.ts · saved as v7" (docs/design/blends-frame-mockup.html,
 * scenario 2). DSH draws it in the `conversation.chat.turnTail` slot, before the answer's action row, once per completed turn.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { ChatSavesStore, saveLine, SAVE_RETRY_MS } from './chat-saves.ts'

/** The turn as the slot hands it over: the number the Host saved it under, and whether it has ended. */
export interface TurnSaveFooterProps {
  readonly sessionId: string
  readonly turn: { readonly turn: number; readonly status: 'open' | 'closed' | 'unknown'; readonly end?: { readonly time?: number } }
  readonly chatSaves: ChatSavesStore
}

/** A turn that ended longer ago than this is read once: the save it was going to have, it has. */
const RECENT_MS = 30_000

export function TurnSaveFooter({ sessionId, turn, chatSaves }: TurnSaveFooterProps) {
  const subscribe = useCallback((listener: () => void) => chatSaves.subscribe(listener), [chatSaves])
  const saves = useSyncExternalStore(subscribe, () => chatSaves.getSnapshot(sessionId))
  const save = saves.find(entry => entry.turn === turn.turn)
  const closed = turn.status === 'closed'
  const endedAt = turn.end?.time
  useEffect(() => {
    if (!closed || save !== undefined) return undefined
    void chatSaves.refresh(sessionId)
    if (endedAt !== undefined && Date.now() - endedAt > RECENT_MS) return undefined
    const timers = SAVE_RETRY_MS.map(delay => window.setTimeout(() => { void chatSaves.refresh(sessionId) }, delay))
    return () => { for (const timer of timers) window.clearTimeout(timer) }
  }, [chatSaves, sessionId, closed, save === undefined, endedAt])
  if (save === undefined) return null
  return (
    <div className="acrylBlendsTurnSave" title={save.files.join('\n')}>
      {saveLine(save)}
    </div>
  )
}
