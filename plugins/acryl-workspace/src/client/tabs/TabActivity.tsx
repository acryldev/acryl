/** A small marker on an agent tab: working now, or finished. */

import { useSyncExternalStore } from 'react'
import type { TerminalSession } from '../terminal/terminal-session.ts'

const NONE_SUBSCRIBE = (): (() => void) => () => {}
const NONE_SNAPSHOT = (): undefined => undefined

export function TabActivity({ session }: { readonly session: TerminalSession | undefined }) {
  const snapshot = useSyncExternalStore(session?.subscribe ?? NONE_SUBSCRIBE, session === undefined ? NONE_SNAPSHOT : session.getSnapshot)
  if (snapshot === undefined) return null
  if (snapshot.status === 'live') return <span className="dshWorkspaceTabActivity" data-state="live" title="Running" />
  if (snapshot.status === 'exited') return <span className="dshWorkspaceTabActivity" data-state="ended" title="Finished" />
  return null
}
