/** A small marker on an agent tab: needs you, working now, waiting for your next message, or finished. */

import { useSyncExternalStore } from 'react'
import type { AgentState } from '../../agents/status/agent-status.ts'
import type { TerminalSession } from '../terminal/terminal-session.ts'

const NONE_SUBSCRIBE = (): (() => void) => () => {}
const NONE_SNAPSHOT = (): undefined => undefined

export function TabActivity({ session, state }: { readonly session: TerminalSession | undefined; /** What the agent reported through its hooks, when it does. */ readonly state?: AgentState | undefined }) {
  const snapshot = useSyncExternalStore(session?.subscribe ?? NONE_SUBSCRIBE, session === undefined ? NONE_SNAPSHOT : session.getSnapshot)
  if (snapshot === undefined) return null
  if (snapshot.status === 'live' && state === 'waiting') return <span className="dshWorkspaceTabActivity" data-state="waiting" title="Needs you" />
  if (snapshot.status === 'live' && state === 'done') return <span className="dshWorkspaceTabActivity" data-state="idle" title="Finished, waiting for your next message" />
  if (snapshot.status === 'live') return <span className="dshWorkspaceTabActivity" data-state="live" title="Running" />
  if (snapshot.status === 'exited') return <span className="dshWorkspaceTabActivity" data-state="ended" title="Finished" />
  return null
}
